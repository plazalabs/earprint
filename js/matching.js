(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EarprintMatching = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CLARITY_SCORES = Object.freeze({
    clear: 1.0,
    moderate: 0.5,
    hard: 0.0,
  });

  const CLARITY_LABELS = Object.freeze({
    clear: '잘 들림',
    moderate: '보통',
    hard: '잘 안 들림',
  });

  const PACE_ORDER = Object.freeze({
    slow: 0,
    medium: 1,
    fast: 2,
  });

  const PACE_LABELS = Object.freeze({
    slow: '느림 (추정)',
    medium: '보통 (추정)',
    fast: '빠름 (추정)',
    unknown: '미확인',
  });

  const ACCENT_LABELS = Object.freeze({
    US: '미국 (US)',
    UK: '영국 (UK)',
    Canadian: '캐나다 (Canadian)',
    Australian: '호주 (Australian)',
    Irish: '아일랜드 (Irish)',
    Indian: '인도 (Indian)',
    Swedish: '스웨덴 (Swedish)',
    unknown: '미확인 (unknown)',
  });

  const TOPIC_LABELS = Object.freeze({
    education: '교육',
    creativity: '창의성',
    communication: '커뮤니케이션',
    science: '과학',
    technology: '기술',
    psychology: '심리',
    society: '사회',
    economics: '경제',
  });

  const FEATURE_WEIGHTS = Object.freeze({
    accent: 0.45,
    pace: 0.35,
    topic: 0.2,
  });

  const HIGH_SCORE_THRESHOLD = 0.6;
  const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
  const FORBIDDEN_DEMOGRAPHIC_KEYS = Object.freeze(['age', 'gender', 'sex']);

  const ALGORITHM_VERSION = 'v1';
  const ALGORITHM_VERSION_LABEL = '예측 모델 v1';
  const EARPRINT_MIN_TRAIT_SAMPLES = 3;
  const EARPRINT_GATE_MESSAGE = '분석 중 — 데이터가 쌓이면 열립니다';
  const ACOUSTIC_UNMEASURED_STATUS = '분석 중 — 아직 측정하지 않는 특성';
  const UNMEASURED_ACOUSTIC_TRAITS = Object.freeze([
    Object.freeze({
      key: 'consonant_clarity',
      label: '자음 명료도',
      status: ACOUSTIC_UNMEASURED_STATUS,
    }),
    Object.freeze({
      key: 'sentence_stress',
      label: '문장 강세',
      status: ACOUSTIC_UNMEASURED_STATUS,
    }),
    Object.freeze({
      key: 'connected_speech',
      label: '연결 발음',
      status: ACOUSTIC_UNMEASURED_STATUS,
    }),
  ]);

  const RECOMMENDATION_REASON_CHIPS = Object.freeze({
    SIMILAR_PACE: '발화 속도가 비슷한 화자',
    SIMILAR_ACCENT: '높은 이해도를 보인 악센트와 유사',
    SAME_TOPIC: '동일 주제에서 높은 이해도를 보임',
    HIGH_ACTUAL_TEST: '실제 테스트에서 높은 이해도를 기록',
  });

  const EXPERIMENT_STORAGE_KEY = 'earprint_experiment_v1';
  const HOLDOUT_SPEAKER_IDS = Object.freeze([
    'ken-robinson',
    'julian-treasure',
    'celeste-headlee',
    'tim-urban',
  ]);

  function formatAccent(accent) {
    return ACCENT_LABELS[accent] || accent || ACCENT_LABELS.unknown;
  }

  function formatPace(pace) {
    return PACE_LABELS[pace] || `${pace} (추정)`;
  }

  function formatTopic(topic) {
    return TOPIC_LABELS[topic] || topic;
  }

  function roundTo(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  /**
   * Computes a normalized [0, 1] listening suitability score from a rating.
   * @param {{ clarity: string, comprehension: number }} rating
   * @returns {number | null}
   */
  function scoreEvaluation(rating) {
    if (!rating || typeof rating !== 'object') return null;
    if (!Object.prototype.hasOwnProperty.call(CLARITY_SCORES, rating.clarity)) {
      return null;
    }
    const comp = Number(rating.comprehension);
    if (!Number.isFinite(comp) || comp < 1 || comp > 5) {
      return null;
    }
    const clarityNorm = CLARITY_SCORES[rating.clarity];
    const compNorm = (comp - 1) / 4;
    return roundTo(clarityNorm * 0.5 + compNorm * 0.5, 4);
  }

  function isHighRating(rating) {
    const score = scoreEvaluation(rating);
    return score !== null && score >= HIGH_SCORE_THRESHOLD;
  }

  /**
   * Computes feature similarity in [0, 1] between two speakers.
   */
  function computeSpeakerSimilarity(candidate, reference) {
    const validAccent =
      candidate.accent &&
      reference.accent &&
      candidate.accent !== 'unknown' &&
      reference.accent !== 'unknown';
    const accentMatch = validAccent && candidate.accent === reference.accent ? 1 : 0;

    let paceMatch = 0;
    const candPaceIdx = PACE_ORDER[candidate.pace];
    const refPaceIdx = PACE_ORDER[reference.pace];
    if (candPaceIdx !== undefined && refPaceIdx !== undefined) {
      const diff = Math.abs(candPaceIdx - refPaceIdx);
      if (diff === 0) paceMatch = 1;
      else if (diff === 1) paceMatch = 0.4;
      else paceMatch = 0;
    }

    const candTopics = Array.isArray(candidate.topics) ? candidate.topics : [];
    const refTopics = Array.isArray(reference.topics) ? reference.topics : [];
    const refSet = new Set(refTopics);
    const sharedTopics = candTopics.filter((t) => refSet.has(t));
    const unionSize = new Set(candTopics.concat(refTopics)).size;
    const topicOverlap = unionSize > 0 ? sharedTopics.length / unionSize : 0;

    const total =
      FEATURE_WEIGHTS.accent * accentMatch +
      FEATURE_WEIGHTS.pace * paceMatch +
      FEATURE_WEIGHTS.topic * topicOverlap;

    return {
      score: roundTo(total, 4),
      accentMatch,
      paceMatch,
      topicOverlap: roundTo(topicOverlap, 4),
      sharedTopics,
    };
  }

  /**
   * Generates a Korean sentence explaining why a speaker is recommended.
   */
  function buildRecommendationReason(candidate, anchor, similarity) {
    const reasons = [];
    if (similarity.accentMatch === 1) {
      reasons.push(`${formatAccent(candidate.accent)} 악센트가 같고`);
    }
    if (similarity.paceMatch === 1) {
      reasons.push(`발화 속도(${formatPace(candidate.pace)})가 일치하며`);
    } else if (similarity.paceMatch > 0) {
      reasons.push(`발화 속도(${formatPace(candidate.pace)})가 비슷하며`);
    }
    if (similarity.sharedTopics.length > 0) {
      const topicText = similarity.sharedTopics.map(formatTopic).join('·');
      reasons.push(`${topicText} 주제가 겹쳐`);
    }

    if (reasons.length === 0) {
      return `높게 평가한 ${anchor.name} 화자와 인접한 청취 프로파일 후보로 추천합니다.`;
    }

    const joined = reasons.join(' ');
    return `높게 평가한 ${anchor.name} 화자와 ${joined} 편하게 들릴 가능성이 높습니다.`;
  }

  function aggregateByFeature(entries, keyGetter, labelGetter) {
    const groups = new Map();
    for (const item of entries) {
      const key = keyGetter(item.speaker) || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: labelGetter(key),
          count: 0,
          scoreSum: 0,
          compSum: 0,
          clearCount: 0,
          moderateCount: 0,
          hardCount: 0,
        });
      }
      const g = groups.get(key);
      g.count += 1;
      g.scoreSum += item.score;
      g.compSum += Number(item.rating.comprehension);
      if (item.rating.clarity === 'clear') g.clearCount += 1;
      else if (item.rating.clarity === 'moderate') g.moderateCount += 1;
      else if (item.rating.clarity === 'hard') g.hardCount += 1;
    }

    return Array.from(groups.values())
      .map((g) => ({
        key: g.key,
        label: g.label,
        count: g.count,
        avgScore: roundTo(g.scoreSum / g.count, 4),
        avgScorePct: Math.round((g.scoreSum / g.count) * 100),
        avgComprehension: roundTo(g.compSum / g.count, 2),
        clearCount: g.clearCount,
        moderateCount: g.moderateCount,
        hardCount: g.hardCount,
      }))
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        if (b.count !== a.count) return b.count - a.count;
        return a.key.localeCompare(b.key);
      });
  }

  function aggregateByMultiFeature(entries, keysGetter, labelGetter) {
    const groups = new Map();
    for (const item of entries) {
      const rawKeys = keysGetter(item.speaker);
      if (!Array.isArray(rawKeys) || rawKeys.length === 0) continue;
      const uniqueKeys = Array.from(new Set(rawKeys.filter((k) => typeof k === 'string' && k.trim() !== '')));
      for (const key of uniqueKeys) {
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: labelGetter(key),
            count: 0,
            scoreSum: 0,
            compSum: 0,
            clearCount: 0,
            moderateCount: 0,
            hardCount: 0,
          });
        }
        const g = groups.get(key);
        g.count += 1;
        g.scoreSum += item.score;
        g.compSum += Number(item.rating.comprehension);
        if (item.rating.clarity === 'clear') g.clearCount += 1;
        else if (item.rating.clarity === 'moderate') g.moderateCount += 1;
        else if (item.rating.clarity === 'hard') g.hardCount += 1;
      }
    }

    return Array.from(groups.values())
      .map((g) => ({
        key: g.key,
        label: g.label,
        count: g.count,
        avgScore: roundTo(g.scoreSum / g.count, 4),
        avgScorePct: Math.round((g.scoreSum / g.count) * 100),
        avgComprehension: roundTo(g.compSum / g.count, 2),
        clearCount: g.clearCount,
        moderateCount: g.moderateCount,
        hardCount: g.hardCount,
      }))
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        if (b.count !== a.count) return b.count - a.count;
        return a.key.localeCompare(b.key);
      });
  }

  /**
   * Builds a user's Earprint summary broken down by accent, estimated pace, and topics.
   */
  function computeEarprintProfile(speakers, ratingsMap) {
    const list = Array.isArray(speakers) ? speakers : [];
    const ratings = ratingsMap && typeof ratingsMap === 'object' ? ratingsMap : {};

    const evaluatedEntries = [];
    for (const speaker of list) {
      const rating = ratings[speaker.id];
      const score = scoreEvaluation(rating);
      if (score !== null) {
        evaluatedEntries.push({ speaker, rating, score });
      }
    }

    const totalCount = list.length;
    const evaluatedCount = evaluatedEntries.length;

    if (evaluatedCount === 0) {
      return {
        evaluatedCount: 0,
        totalCount,
        avgScore: 0,
        avgScorePct: 0,
        avgComprehension: 0,
        byAccent: [],
        byPace: [],
        byTopic: [],
        topAccent: null,
        topPace: null,
        topTopic: null,
        summaryText: '아직 평가한 화자가 없습니다. 클립을 듣고 평가하면 나의 Earprint가 생성됩니다.',
      };
    }

    const scoreSum = evaluatedEntries.reduce((acc, e) => acc + e.score, 0);
    const compSum = evaluatedEntries.reduce((acc, e) => acc + Number(e.rating.comprehension), 0);
    const avgScore = roundTo(scoreSum / evaluatedCount, 4);
    const avgComprehension = roundTo(compSum / evaluatedCount, 2);

    const byAccent = aggregateByFeature(
      evaluatedEntries,
      (s) => s.accent,
      formatAccent
    );
    const byPace = aggregateByFeature(
      evaluatedEntries,
      (s) => s.pace,
      formatPace
    );
    const byTopic = aggregateByMultiFeature(
      evaluatedEntries,
      (s) => s.topics,
      formatTopic
    );

    const topAccent = byAccent[0] || null;
    const topPace = byPace[0] || null;
    const topTopic = byTopic[0] || null;

    let summaryText = `총 ${evaluatedCount}명의 화자를 평가했습니다.`;
    if (topAccent && topPace) {
      summaryText = `현재까지 ${evaluatedCount}명 평가 기준, ${topAccent.label} 악센트(적합도 ${topAccent.avgScorePct}%)와 ${topPace.label} 속도(적합도 ${topPace.avgScorePct}%)에서 상대적으로 높은 이해도를 보였습니다.`;
    }

    return {
      evaluatedCount,
      totalCount,
      avgScore,
      avgScorePct: Math.round(avgScore * 100),
      avgComprehension,
      byAccent,
      byPace,
      byTopic,
      topAccent,
      topPace,
      topTopic,
      summaryText,
    };
  }

  function buildTraitObservation(dimensionName, topItem) {
    if (!topItem) return null;
    if (topItem.avgScore >= HIGH_SCORE_THRESHOLD) {
      return `평가 ${topItem.count}건 기준 ${topItem.label} ${dimensionName}에서 높은 이해도를 보였습니다 (적합도 ${topItem.avgScorePct}%).`;
    }
    return `평가 ${topItem.count}건 기준 ${topItem.label} ${dimensionName}의 적합도가 ${topItem.avgScorePct}%로 기록되었습니다.`;
  }

  /**
   * Builds measurable listening traits from an Earprint profile with a minimum-sample gate
   * and explicit unmeasured placeholders for acoustic traits.
   */
  function buildEarprintTraits(profile, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const minSamples =
      Number.isInteger(opts.minSamples) && opts.minSamples > 0
        ? opts.minSamples
        : EARPRINT_MIN_TRAIT_SAMPLES;
    const evaluatedCount =
      profile && Number.isFinite(profile.evaluatedCount) ? profile.evaluatedCount : 0;
    const unlocked = evaluatedCount >= minSamples;

    if (!unlocked) {
      return {
        unlocked: false,
        minSamples,
        evaluatedCount,
        gateMessage: EARPRINT_GATE_MESSAGE,
        measurable: null,
        acousticTraits: [],
      };
    }

    const byAccent = Array.isArray(profile.byAccent) ? profile.byAccent : [];
    const byPace = Array.isArray(profile.byPace) ? profile.byPace : [];
    const byTopic = Array.isArray(profile.byTopic) ? profile.byTopic : [];

    return {
      unlocked: true,
      minSamples,
      evaluatedCount,
      gateMessage: null,
      measurable: {
        accent: {
          title: '악센트별 적합도',
          estimated: false,
          items: byAccent,
          observation: buildTraitObservation('악센트', byAccent[0] || null),
        },
        pace: {
          title: '발화 속도별 적합도',
          estimated: true,
          items: byPace,
          observation: buildTraitObservation('발화 속도', byPace[0] || null),
        },
        topic: {
          title: '주제별 적합도',
          estimated: false,
          items: byTopic,
          observation: buildTraitObservation('주제', byTopic[0] || null),
        },
      },
      acousticTraits: UNMEASURED_ACOUSTIC_TRAITS.map((trait) => ({ ...trait })),
    };
  }

  /**
   * Classifies computable recommendation reason chips for a candidate speaker.
   * Only emits chips directly supported by the user's evaluation or submitted test data.
   * @param {object} candidate
   * @param {{ profile?: object, speakers?: object[], ratingsMap?: object, predictionRecords?: object[], experimentResults?: object[], testRecords?: object[] }} context
   * @returns {Array<{ type: string, label: string }>}
   */
  function classifyRecommendationReasons(candidate, context) {
    if (!candidate || typeof candidate !== 'object') return [];
    const ctx = context && typeof context === 'object' ? context : {};

    let profile = ctx.profile && typeof ctx.profile === 'object' ? ctx.profile : null;
    if (!profile && Array.isArray(ctx.speakers) && ctx.ratingsMap && typeof ctx.ratingsMap === 'object') {
      profile = computeEarprintProfile(ctx.speakers, ctx.ratingsMap);
    }

    const chips = [];

    if (profile && Number.isFinite(profile.evaluatedCount) && profile.evaluatedCount > 0) {
      // 1. Similar speaking pace
      const candPaceIdx = PACE_ORDER[candidate.pace];
      const byPace = Array.isArray(profile.byPace) ? profile.byPace : [];
      if (candPaceIdx !== undefined && byPace.length > 0) {
        const exactPace = byPace.find(
          (entry) =>
            entry &&
            entry.key === candidate.pace &&
            Number.isFinite(entry.count) &&
            entry.count > 0 &&
            Number.isFinite(entry.avgScore)
        );
        let paceSupported = false;
        if (exactPace) {
          paceSupported = exactPace.avgScore >= HIGH_SCORE_THRESHOLD;
        } else {
          paceSupported = byPace.some(
            (entry) =>
              entry &&
              PACE_ORDER[entry.key] !== undefined &&
              Math.abs(PACE_ORDER[entry.key] - candPaceIdx) === 1 &&
              Number.isFinite(entry.count) &&
              entry.count > 0 &&
              Number.isFinite(entry.avgScore) &&
              entry.avgScore >= HIGH_SCORE_THRESHOLD
          );
        }
        if (paceSupported) {
          chips.push({
            type: 'pace',
            label: RECOMMENDATION_REASON_CHIPS.SIMILAR_PACE,
          });
        }
      }

      // 2. Similar accent with high comprehension
      const byAccent = Array.isArray(profile.byAccent) ? profile.byAccent : [];
      if (candidate.accent && candidate.accent !== 'unknown' && byAccent.length > 0) {
        const accentEntry = byAccent.find(
          (entry) =>
            entry &&
            entry.key === candidate.accent &&
            Number.isFinite(entry.count) &&
            entry.count > 0 &&
            Number.isFinite(entry.avgScore)
        );
        if (accentEntry && accentEntry.avgScore >= HIGH_SCORE_THRESHOLD) {
          chips.push({
            type: 'accent',
            label: RECOMMENDATION_REASON_CHIPS.SIMILAR_ACCENT,
          });
        }
      }

      // 3. Same topic with high comprehension
      const byTopic = Array.isArray(profile.byTopic) ? profile.byTopic : [];
      const candTopics = Array.isArray(candidate.topics) ? candidate.topics : [];
      if (candTopics.length > 0 && byTopic.length > 0) {
        const highTopicSet = new Set(
          byTopic
            .filter(
              (entry) =>
                entry &&
                typeof entry.key === 'string' &&
                Number.isFinite(entry.count) &&
                entry.count > 0 &&
                Number.isFinite(entry.avgScore) &&
                entry.avgScore >= HIGH_SCORE_THRESHOLD
            )
            .map((entry) => entry.key)
        );
        if (candTopics.some((t) => highTopicSet.has(t))) {
          chips.push({
            type: 'topic',
            label: RECOMMENDATION_REASON_CHIPS.SAME_TOPIC,
          });
        }
      }
    }

    // 4. High comprehension recorded in actual Blind/Holdout tests for this speaker
    const combinedTests = []
      .concat(Array.isArray(ctx.testRecords) ? ctx.testRecords : [])
      .concat(Array.isArray(ctx.predictionRecords) ? ctx.predictionRecords : [])
      .concat(Array.isArray(ctx.experimentResults) ? ctx.experimentResults : []);

    if (typeof candidate.id === 'string' && combinedTests.length > 0) {
      let sum = 0;
      let count = 0;
      for (const rec of combinedTests) {
        if (
          rec &&
          typeof rec === 'object' &&
          rec.speakerId === candidate.id &&
          typeof rec.actualScore === 'number' &&
          Number.isFinite(rec.actualScore) &&
          rec.actualScore >= 0 &&
          rec.actualScore <= 1
        ) {
          sum += rec.actualScore;
          count += 1;
        }
      }
      if (count > 0 && sum / count >= HIGH_SCORE_THRESHOLD) {
        chips.push({
          type: 'actual_test',
          label: RECOMMENDATION_REASON_CHIPS.HIGH_ACTUAL_TEST,
        });
      }
    }

    return chips;
  }

  /**
   * Recommends unrated speakers closest in accent, estimated pace, and topics
   * to the user's highly rated speakers, with explanatory reason sentences.
   */
  function recommendSpeakers(speakers, ratingsMap, options) {
    const list = Array.isArray(speakers) ? speakers : [];
    const ratings = ratingsMap && typeof ratingsMap === 'object' ? ratingsMap : {};
    const limit =
      options && Number.isInteger(options.limit) && options.limit > 0
        ? options.limit
        : 3;

    const rated = [];
    const unrated = [];

    for (const speaker of list) {
      const rating = ratings[speaker.id];
      const score = scoreEvaluation(rating);
      if (score !== null) {
        rated.push({ speaker, rating, score });
      } else {
        unrated.push(speaker);
      }
    }

    if (rated.length === 0) {
      return {
        status: 'no_ratings',
        message: '먼저 화자 클립을 1개 이상 평가하면 비슷한 특성의 화자를 추천해 드립니다.',
        recommendations: [],
      };
    }

    if (unrated.length === 0) {
      return {
        status: 'all_rated',
        message: '모든 화자(12명)의 평가를 완료했습니다. Earprint 요약과 콘텐츠 탐색을 확인해 보세요.',
        recommendations: [],
      };
    }

    const positiveAnchors = rated
      .filter((entry) => entry.score >= HIGH_SCORE_THRESHOLD)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.speaker.id.localeCompare(b.speaker.id);
      });

    if (positiveAnchors.length === 0) {
      const contrastCandidates = unrated
        .map((candidate) => {
          let simSum = 0;
          for (const lowEntry of rated) {
            simSum += computeSpeakerSimilarity(candidate, lowEntry.speaker).score;
          }
          const avgSimToHard = simSum / rated.length;
          const contrastScore = roundTo(1 - avgSimToHard, 4);
          return {
            speaker: candidate,
            matchScore: contrastScore,
            matchScorePct: Math.round(contrastScore * 100),
            anchorSpeakerId: null,
            anchorSpeakerName: null,
            matchedFeatures: {
              accentMatch: false,
              paceMatch: false,
              sharedTopics: [],
            },
            reason: `아직 높게 평가한 화자가 없어, 기존에 어렵게 느낀 화자와 다른 ${formatAccent(candidate.accent)}·${formatPace(candidate.pace)} 특성의 화자를 탐색 후보로 제안합니다.`,
          };
        })
        .sort((a, b) => {
          if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
          return a.speaker.id.localeCompare(b.speaker.id);
        });

      return {
        status: 'contrast_fallback',
        message: '높게 평가한 화자가 아직 없어, 다른 특성의 화자를 우선 제안합니다.',
        recommendations: contrastCandidates.slice(0, limit),
      };
    }

    const totalAnchorWeight = positiveAnchors.reduce((acc, a) => acc + a.score, 0);

    const scored = unrated.map((candidate) => {
      let weightedSimSum = 0;
      let bestAnchor = positiveAnchors[0];
      let bestSim = computeSpeakerSimilarity(candidate, positiveAnchors[0].speaker);
      let bestContribution = bestSim.score * positiveAnchors[0].score;

      for (const anchor of positiveAnchors) {
        const sim = computeSpeakerSimilarity(candidate, anchor.speaker);
        const contribution = sim.score * anchor.score;
        weightedSimSum += contribution;
        if (
          contribution > bestContribution ||
          (contribution === bestContribution && anchor.score > bestAnchor.score)
        ) {
          bestContribution = contribution;
          bestAnchor = anchor;
          bestSim = sim;
        }
      }

      const matchScore = roundTo(weightedSimSum / totalAnchorWeight, 4);

      return {
        speaker: candidate,
        matchScore,
        matchScorePct: Math.round(matchScore * 100),
        anchorSpeakerId: bestAnchor.speaker.id,
        anchorSpeakerName: bestAnchor.speaker.name,
        matchedFeatures: {
          accentMatch: bestSim.accentMatch === 1,
          paceMatch: bestSim.paceMatch === 1,
          paceClose: bestSim.paceMatch > 0,
          sharedTopics: bestSim.sharedTopics,
        },
        reason: buildRecommendationReason(candidate, bestAnchor.speaker, bestSim),
      };
    });

    scored.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (Number(b.matchedFeatures.accentMatch) !== Number(a.matchedFeatures.accentMatch)) {
        return Number(b.matchedFeatures.accentMatch) - Number(a.matchedFeatures.accentMatch);
      }
      if (Number(b.matchedFeatures.paceMatch) !== Number(a.matchedFeatures.paceMatch)) {
        return Number(b.matchedFeatures.paceMatch) - Number(a.matchedFeatures.paceMatch);
      }
      return a.speaker.id.localeCompare(b.speaker.id);
    });

    return {
      status: 'matched',
      message: `높게 평가한 화자 ${positiveAnchors.length}명의 특성을 기준으로 추천했습니다.`,
      recommendations: scored.slice(0, limit),
    };
  }

  /**
   * Validates speakers dataset structure and business rules.
   */
  function validateSpeakersData(data) {
    const errors = [];
    if (!data || typeof data !== 'object' || !Array.isArray(data.speakers)) {
      return { valid: false, errors: ['Root object must contain a speakers array.'] };
    }

    const seenIds = new Set();
    data.speakers.forEach((speaker, index) => {
      const prefix = `speakers[${index}]`;
      if (!speaker || typeof speaker !== 'object') {
        errors.push(`${prefix}: must be an object.`);
        return;
      }

      for (const forbiddenKey of FORBIDDEN_DEMOGRAPHIC_KEYS) {
        if (Object.prototype.hasOwnProperty.call(speaker, forbiddenKey)) {
          errors.push(`${prefix}: forbidden demographic field "${forbiddenKey}" found.`);
        }
      }

      const requiredStringFields = ['id', 'name', 'channel', 'accent', 'pace', 'paceLabel'];
      for (const field of requiredStringFields) {
        if (typeof speaker[field] !== 'string' || speaker[field].trim() === '') {
          errors.push(`${prefix}: missing or empty required string field "${field}".`);
        }
      }

      if (typeof speaker.id === 'string' && speaker.id.trim() !== '') {
        if (seenIds.has(speaker.id)) {
          errors.push(`${prefix}: duplicate speaker id "${speaker.id}".`);
        }
        seenIds.add(speaker.id);
      }

      if (speaker.paceEstimated !== true) {
        errors.push(`${prefix}: paceEstimated must be true.`);
      }
      if (typeof speaker.paceLabel === 'string' && !speaker.paceLabel.includes('추정')) {
        errors.push(`${prefix}: paceLabel must explicitly include "추정".`);
      }

      if (!Array.isArray(speaker.topics) || speaker.topics.length === 0) {
        errors.push(`${prefix}: topics must be a non-empty array.`);
      }

      if (!speaker.clip || typeof speaker.clip !== 'object') {
        errors.push(`${prefix}: missing clip object.`);
      } else {
        if (typeof speaker.clip.title !== 'string' || speaker.clip.title.trim() === '') {
          errors.push(`${prefix}.clip: missing title.`);
        }
        if (typeof speaker.clip.videoId !== 'string' || !VIDEO_ID_REGEX.test(speaker.clip.videoId)) {
          errors.push(`${prefix}.clip: invalid YouTube videoId "${speaker.clip.videoId}".`);
        }
        if (
          typeof speaker.clip.startSeconds !== 'number' ||
          !Number.isInteger(speaker.clip.startSeconds) ||
          speaker.clip.startSeconds < 0
        ) {
          errors.push(`${prefix}.clip: startSeconds must be a non-negative integer.`);
        }
      }

      if (!Array.isArray(speaker.moreContent) || speaker.moreContent.length === 0) {
        errors.push(`${prefix}: moreContent must be a non-empty array.`);
      } else {
        speaker.moreContent.forEach((item, cIdx) => {
          const cPrefix = `${prefix}.moreContent[${cIdx}]`;
          if (!item || typeof item !== 'object') {
            errors.push(`${cPrefix}: must be an object.`);
            return;
          }
          if (typeof item.title !== 'string' || item.title.trim() === '') {
            errors.push(`${cPrefix}: missing title.`);
          }
          if (typeof item.channel !== 'string' || item.channel.trim() === '') {
            errors.push(`${cPrefix}: missing channel.`);
          }
          if (typeof item.videoId !== 'string' || !VIDEO_ID_REGEX.test(item.videoId)) {
            errors.push(`${cPrefix}: invalid YouTube videoId "${item.videoId}".`);
          }
          if (
            typeof item.url !== 'string' ||
            !item.url.startsWith('https://www.youtube.com/watch?v=')
          ) {
            errors.push(`${cPrefix}: url must be a valid YouTube watch URL.`);
          }
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  const PREDICTION_WEIGHTS = Object.freeze({
    accent: 0.45,
    pace: 0.35,
    baseline: 0.2,
  });

  const ACTUAL_SCORE_WEIGHTS = Object.freeze({
    objective: 0.5,
    subjective: 0.5,
  });

  function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  /**
   * Predicts a user's listening suitability score in [0, 1] for an unseen speaker
   * using their computed Earprint profile (DOM-free pure function).
   * @param {object} profile
   * @param {object} speaker
   * @returns {number | null}
   */
  function predictScore(profile, speaker) {
    if (
      !profile ||
      typeof profile !== 'object' ||
      !Number.isFinite(profile.evaluatedCount) ||
      profile.evaluatedCount <= 0 ||
      !Number.isFinite(profile.avgScore)
    ) {
      return null;
    }
    if (!speaker || typeof speaker !== 'object') {
      return null;
    }

    const base = clamp01(Number(profile.avgScore));
    const unseenPrior = roundTo(0.5 * base + 0.25, 4);

    const byAccent = Array.isArray(profile.byAccent) ? profile.byAccent : [];
    let accentEst = unseenPrior;
    if (speaker.accent && speaker.accent !== 'unknown') {
      const accentEntry = byAccent.find(
        (entry) =>
          entry &&
          entry.key === speaker.accent &&
          Number.isFinite(entry.count) &&
          entry.count > 0 &&
          Number.isFinite(entry.avgScore)
      );
      if (accentEntry) {
        accentEst = clamp01(Number(accentEntry.avgScore));
      }
    }

    const byPace = Array.isArray(profile.byPace) ? profile.byPace : [];
    let paceEst = unseenPrior;
    const candPaceIdx = PACE_ORDER[speaker.pace];
    if (candPaceIdx !== undefined) {
      const exactPace = byPace.find(
        (entry) =>
          entry &&
          entry.key === speaker.pace &&
          Number.isFinite(entry.count) &&
          entry.count > 0 &&
          Number.isFinite(entry.avgScore)
      );
      if (exactPace) {
        paceEst = clamp01(Number(exactPace.avgScore));
      } else {
        let adjWeightedSum = 0;
        let adjCountSum = 0;
        for (const entry of byPace) {
          if (
            !entry ||
            PACE_ORDER[entry.key] === undefined ||
            !Number.isFinite(entry.count) ||
            entry.count <= 0 ||
            !Number.isFinite(entry.avgScore)
          ) {
            continue;
          }
          if (Math.abs(PACE_ORDER[entry.key] - candPaceIdx) === 1) {
            adjWeightedSum += clamp01(Number(entry.avgScore)) * entry.count;
            adjCountSum += entry.count;
          }
        }
        if (adjCountSum > 0) {
          const adjAvg = adjWeightedSum / adjCountSum;
          paceEst = 0.5 * adjAvg + 0.5 * unseenPrior;
        }
      }
    }

    const predicted =
      PREDICTION_WEIGHTS.accent * accentEst +
      PREDICTION_WEIGHTS.pace * paceEst +
      PREDICTION_WEIGHTS.baseline * base;

    return roundTo(clamp01(predicted), 4);
  }

  /**
   * Grades objective multiple-choice comprehension answers.
   * @param {Array<{ choices: string[], answerIndex: number }>} questions
   * @param {number[]} selectedIndices
   * @returns {object | null}
   */
  function gradeQuiz(questions, selectedIndices) {
    if (!Array.isArray(questions) || questions.length === 0) return null;
    if (!Array.isArray(selectedIndices) || selectedIndices.length !== questions.length) {
      return null;
    }

    let correctCount = 0;
    const itemResults = [];

    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (
        !q ||
        typeof q !== 'object' ||
        !Array.isArray(q.choices) ||
        q.choices.length < 2 ||
        !Number.isInteger(q.answerIndex) ||
        q.answerIndex < 0 ||
        q.answerIndex >= q.choices.length
      ) {
        return null;
      }
      const selected = Number(selectedIndices[i]);
      if (!Number.isInteger(selected) || selected < 0 || selected >= q.choices.length) {
        return null;
      }
      const isCorrect = selected === q.answerIndex;
      if (isCorrect) correctCount += 1;
      itemResults.push(isCorrect);
    }

    const accuracy = roundTo(correctCount / questions.length, 4);
    return {
      correctCount,
      totalQuestions: questions.length,
      accuracy,
      accuracyPct: Math.round(accuracy * 100),
      itemResults,
    };
  }

  /**
   * Combines subjective listening rating with optional objective quiz accuracy.
   * @param {{ clarity: string, comprehension: number }} rating
   * @param {{ accuracy: number } | null} quizResult
   * @returns {object | null}
   */
  function computeActualScore(rating, quizResult) {
    const subjectiveScore = scoreEvaluation(rating);
    if (subjectiveScore === null) return null;

    const hasValidQuiz =
      quizResult &&
      typeof quizResult === 'object' &&
      typeof quizResult.accuracy === 'number' &&
      Number.isFinite(quizResult.accuracy) &&
      quizResult.accuracy >= 0 &&
      quizResult.accuracy <= 1;

    if (hasValidQuiz) {
      const quizAccuracy = roundTo(quizResult.accuracy, 4);
      const actualScore = roundTo(
        ACTUAL_SCORE_WEIGHTS.objective * quizAccuracy +
          ACTUAL_SCORE_WEIGHTS.subjective * subjectiveScore,
        4
      );
      return {
        subjectiveScore,
        subjectiveScorePct: Math.round(subjectiveScore * 100),
        quizAccuracy,
        quizAccuracyPct: Math.round(quizAccuracy * 100),
        actualScore,
        actualScorePct: Math.round(actualScore * 100),
        mode: 'combined',
      };
    }

    return {
      subjectiveScore,
      subjectiveScorePct: Math.round(subjectiveScore * 100),
      quizAccuracy: null,
      quizAccuracyPct: null,
      actualScore: subjectiveScore,
      actualScorePct: Math.round(subjectiveScore * 100),
      mode: 'subjective_only',
    };
  }

  /**
   * Computes signed and absolute prediction errors between predicted and actual scores in [0, 1].
   * @param {number} predictedScore
   * @param {number} actualScore
   * @returns {object | null}
   */
  function computePredictionError(predictedScore, actualScore) {
    if (
      typeof predictedScore !== 'number' ||
      !Number.isFinite(predictedScore) ||
      predictedScore < 0 ||
      predictedScore > 1
    ) {
      return null;
    }
    if (
      typeof actualScore !== 'number' ||
      !Number.isFinite(actualScore) ||
      actualScore < 0 ||
      actualScore > 1
    ) {
      return null;
    }

    const pred = roundTo(predictedScore, 4);
    const actual = roundTo(actualScore, 4);
    const signedError = roundTo(pred - actual, 4);
    const absError = roundTo(Math.abs(pred - actual), 4);

    return {
      predictedScore: pred,
      predictedScorePct: roundTo(pred * 100, 1),
      actualScore: actual,
      actualScorePct: roundTo(actual * 100, 1),
      signedError,
      absError,
      signedErrorPct: roundTo(signedError * 100, 1),
      absErrorPct: roundTo(absError * 100, 1),
    };
  }

  /**
   * Builds a Blind prediction session queue alternating between 'recommended' and 'random' speakers.
   * Each queue item freezes its pre-listening predictedScore before presentation.
   */
  function buildPredictionSession(speakers, ratingsMap, options) {
    const list = Array.isArray(speakers) ? speakers : [];
    const ratings = ratingsMap && typeof ratingsMap === 'object' ? ratingsMap : {};
    const opts = options && typeof options === 'object' ? options : {};
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const startGroup = opts.startGroup === 'random' ? 'random' : 'recommended';
    const quizOnly = Boolean(opts.quizOnly);
    const comprehensionMap =
      opts.comprehensionMap && typeof opts.comprehensionMap === 'object'
        ? opts.comprehensionMap
        : null;

    const excludeSet = new Set();
    if (opts.excludeIds instanceof Set) {
      opts.excludeIds.forEach((id) => excludeSet.add(id));
    } else if (Array.isArray(opts.excludeIds)) {
      opts.excludeIds.forEach((id) => excludeSet.add(id));
    }

    const profile = computeEarprintProfile(list, ratings);
    if (profile.evaluatedCount === 0) {
      return {
        status: 'no_ratings',
        message: '먼저 발견·평가 탭에서 1명 이상의 화자를 평가해 Earprint를 생성해 주세요.',
        queue: [],
        totalCandidates: 0,
        recommendedCount: 0,
        randomCount: 0,
      };
    }

    const eligible = list.filter((speaker) => {
      if (!speaker || typeof speaker.id !== 'string') return false;
      if (scoreEvaluation(ratings[speaker.id]) !== null) return false;
      if (excludeSet.has(speaker.id)) return false;
      if (quizOnly && comprehensionMap) {
        const comp = comprehensionMap[speaker.id];
        if (!comp || comp.quizAvailable !== true) return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      return {
        status: 'no_candidates',
        message: '예측 테스트할 미평가 화자가 남아 있지 않습니다.',
        queue: [],
        totalCandidates: 0,
        recommendedCount: 0,
        randomCount: 0,
      };
    }

    const eligibleMap = new Map(eligible.map((s) => [s.id, s]));
    const recResult = recommendSpeakers(list, ratings, { limit: list.length });
    const rankedRecommendations = recResult.recommendations.filter((rec) =>
      eligibleMap.has(rec.speaker.id)
    );
    const recScoreById = new Map(
      rankedRecommendations.map((rec) => [rec.speaker.id, rec.matchScore])
    );

    const remainingIds = new Set(eligible.map((s) => s.id));
    const queue = [];
    let currentGroup = startGroup;
    let recommendedCount = 0;
    let randomCount = 0;

    while (remainingIds.size > 0) {
      let chosenSpeaker = null;

      if (currentGroup === 'recommended') {
        const topRec = rankedRecommendations.find((rec) => remainingIds.has(rec.speaker.id));
        if (topRec) {
          chosenSpeaker = topRec.speaker;
        } else {
          const fallbackId = Array.from(remainingIds)[0];
          chosenSpeaker = eligibleMap.get(fallbackId);
        }
      } else {
        const pool = Array.from(remainingIds);
        const rawRand = Number(rng());
        const safeRand = Number.isFinite(rawRand)
          ? Math.min(Math.max(rawRand, 0), 0.999999999999)
          : 0;
        const pickIndex = Math.floor(safeRand * pool.length);
        chosenSpeaker = eligibleMap.get(pool[pickIndex]);
      }

      if (!chosenSpeaker) break;
      remainingIds.delete(chosenSpeaker.id);

      const predictedScore = predictScore(profile, chosenSpeaker);
      queue.push({
        speaker: chosenSpeaker,
        group: currentGroup,
        predictedScore,
        predictedScorePct: predictedScore === null ? null : Math.round(predictedScore * 100),
        matchScore: recScoreById.has(chosenSpeaker.id)
          ? recScoreById.get(chosenSpeaker.id)
          : null,
      });

      if (currentGroup === 'recommended') recommendedCount += 1;
      else randomCount += 1;

      currentGroup = currentGroup === 'recommended' ? 'random' : 'recommended';
    }

    return {
      status: 'ready',
      message: `추천 화자와 무작위 화자를 번갈아 Blind로 제시합니다 (총 ${queue.length}명).`,
      queue,
      totalCandidates: queue.length,
      recommendedCount,
      randomCount,
    };
  }

  function summarizeGroupRecords(records) {
    const count = records.length;
    if (count === 0) {
      return {
        count: 0,
        avgActualScore: null,
        avgActualScorePct: null,
        quizSampleCount: 0,
        avgQuizAccuracy: null,
        avgQuizAccuracyPct: null,
        avgSubjectiveScore: null,
        avgSubjectiveScorePct: null,
        avgSubjectiveComprehension: null,
        avgPredictedScore: null,
        avgPredictedScorePct: null,
        avgAbsError: null,
        avgAbsErrorPct: null,
        avgSignedError: null,
        avgSignedErrorPct: null,
      };
    }

    let actualSum = 0;
    let predSum = 0;
    let absErrSum = 0;
    let signedErrSum = 0;
    let quizAccSum = 0;
    let quizCount = 0;
    let subjScoreSum = 0;
    let subjScoreCount = 0;
    let subjCompSum = 0;
    let subjCompCount = 0;

    for (const rec of records) {
      actualSum += rec.actualScore;
      predSum += rec.predictedScore;
      absErrSum += rec.absError;
      signedErrSum += rec.signedError;

      if (typeof rec.quizAccuracy === 'number' && Number.isFinite(rec.quizAccuracy)) {
        quizAccSum += rec.quizAccuracy;
        quizCount += 1;
      }
      if (typeof rec.subjectiveScore === 'number' && Number.isFinite(rec.subjectiveScore)) {
        subjScoreSum += rec.subjectiveScore;
        subjScoreCount += 1;
      }
      if (
        rec.rating &&
        typeof rec.rating.comprehension === 'number' &&
        Number.isFinite(rec.rating.comprehension)
      ) {
        subjCompSum += rec.rating.comprehension;
        subjCompCount += 1;
      }
    }

    const avgActualScore = roundTo(actualSum / count, 4);
    const avgPredictedScore = roundTo(predSum / count, 4);
    const avgAbsError = roundTo(absErrSum / count, 4);
    const avgSignedError = roundTo(signedErrSum / count, 4);
    const avgQuizAccuracy = quizCount > 0 ? roundTo(quizAccSum / quizCount, 4) : null;
    const avgSubjectiveScore =
      subjScoreCount > 0 ? roundTo(subjScoreSum / subjScoreCount, 4) : null;
    const avgSubjectiveComprehension =
      subjCompCount > 0 ? roundTo(subjCompSum / subjCompCount, 2) : null;

    return {
      count,
      avgActualScore,
      avgActualScorePct: roundTo(avgActualScore * 100, 1),
      quizSampleCount: quizCount,
      avgQuizAccuracy,
      avgQuizAccuracyPct: avgQuizAccuracy === null ? null : roundTo(avgQuizAccuracy * 100, 1),
      avgSubjectiveScore,
      avgSubjectiveScorePct:
        avgSubjectiveScore === null ? null : roundTo(avgSubjectiveScore * 100, 1),
      avgSubjectiveComprehension,
      avgPredictedScore,
      avgPredictedScorePct: roundTo(avgPredictedScore * 100, 1),
      avgAbsError,
      avgAbsErrorPct: roundTo(avgAbsError * 100, 1),
      avgSignedError,
      avgSignedErrorPct: roundTo(avgSignedError * 100, 1),
    };
  }

  /**
   * Aggregates prediction verification metrics numerically for 'recommended' vs 'random' groups.
   * Produces pure numeric summaries without any winner/verdict phrasing.
   */
  function summarizePredictionReport(records) {
    const list = Array.isArray(records) ? records : [];
    const recommendedRecords = [];
    const randomRecords = [];

    for (const rec of list) {
      if (!rec || typeof rec !== 'object') continue;
      if (rec.group !== 'recommended' && rec.group !== 'random') continue;
      const err = computePredictionError(rec.predictedScore, rec.actualScore);
      if (!err) continue;

      const normalized = {
        group: rec.group,
        predictedScore: err.predictedScore,
        actualScore: err.actualScore,
        absError: err.absError,
        signedError: err.signedError,
        quizAccuracy:
          typeof rec.quizAccuracy === 'number' &&
          Number.isFinite(rec.quizAccuracy) &&
          rec.quizAccuracy >= 0 &&
          rec.quizAccuracy <= 1
            ? rec.quizAccuracy
            : null,
        subjectiveScore:
          typeof rec.subjectiveScore === 'number' &&
          Number.isFinite(rec.subjectiveScore) &&
          rec.subjectiveScore >= 0 &&
          rec.subjectiveScore <= 1
            ? rec.subjectiveScore
            : rec.rating
              ? scoreEvaluation(rec.rating)
              : null,
        rating: rec.rating || null,
      };

      if (rec.group === 'recommended') recommendedRecords.push(normalized);
      else randomRecords.push(normalized);
    }

    return {
      totalCount: recommendedRecords.length + randomRecords.length,
      recommended: summarizeGroupRecords(recommendedRecords),
      random: summarizeGroupRecords(randomRecords),
    };
  }

  /**
   * Validates data/comprehension.json structure, segment lengths (40-60s),
   * question/choice/answerIndex integrity, source excerpts, and alignment with speakers.json.
   */
  function validateComprehensionData(compData, speakersData) {
    const errors = [];
    const summary = {
      totalSpeakers: 0,
      quizAvailableCount: 0,
      quizUnavailableCount: 0,
      totalQuestions: 0,
    };

    if (!compData || typeof compData !== 'object' || !Array.isArray(compData.items)) {
      return {
        valid: false,
        errors: ['Root object must contain an items array.'],
        summary,
      };
    }

    const speakerMap = new Map();
    if (speakersData && Array.isArray(speakersData.speakers)) {
      for (const s of speakersData.speakers) {
        if (s && typeof s.id === 'string') {
          speakerMap.set(s.id, s);
        }
      }
    }

    const seenSpeakerIds = new Set();
    summary.totalSpeakers = compData.items.length;

    compData.items.forEach((item, idx) => {
      const prefix = `items[${idx}]`;
      if (!item || typeof item !== 'object') {
        errors.push(`${prefix}: must be an object.`);
        return;
      }

      if (typeof item.speakerId !== 'string' || item.speakerId.trim() === '') {
        errors.push(`${prefix}: missing speakerId.`);
      } else {
        if (seenSpeakerIds.has(item.speakerId)) {
          errors.push(`${prefix}: duplicate speakerId "${item.speakerId}".`);
        }
        seenSpeakerIds.add(item.speakerId);
      }

      if (typeof item.videoId !== 'string' || !VIDEO_ID_REGEX.test(item.videoId)) {
        errors.push(`${prefix}: invalid videoId "${item.videoId}".`);
      }

      if (!Number.isInteger(item.startSeconds) || item.startSeconds < 0) {
        errors.push(`${prefix}: startSeconds must be a non-negative integer.`);
      }
      if (!Number.isInteger(item.endSeconds) || item.endSeconds <= item.startSeconds) {
        errors.push(`${prefix}: endSeconds must be an integer greater than startSeconds.`);
      }

      const computedDuration = item.endSeconds - item.startSeconds;
      if (item.durationSeconds !== computedDuration) {
        errors.push(`${prefix}: durationSeconds must equal endSeconds - startSeconds.`);
      }
      if (computedDuration < 40 || computedDuration > 60) {
        errors.push(`${prefix}: segment duration (${computedDuration}s) must be between 40 and 60 seconds.`);
      }

      if (speakerMap.size > 0 && typeof item.speakerId === 'string') {
        const refSpeaker = speakerMap.get(item.speakerId);
        if (!refSpeaker) {
          errors.push(`${prefix}: unknown speakerId "${item.speakerId}" not in speakers.json.`);
        } else {
          if (item.videoId !== refSpeaker.clip.videoId) {
            errors.push(`${prefix}: videoId mismatch with speakers.json for "${item.speakerId}".`);
          }
          if (item.startSeconds !== refSpeaker.clip.startSeconds) {
            errors.push(`${prefix}: startSeconds mismatch with speakers.json for "${item.speakerId}".`);
          }
        }
      }

      if (typeof item.quizAvailable !== 'boolean') {
        errors.push(`${prefix}: quizAvailable must be a boolean.`);
        return;
      }

      if (item.quizAvailable) {
        summary.quizAvailableCount += 1;
        if (typeof item.sourceExcerpt !== 'string' || item.sourceExcerpt.trim().length < 20) {
          errors.push(`${prefix}: quizAvailable item must have a non-empty sourceExcerpt (>= 20 chars).`);
        }
        if (
          typeof item.sourceUrl !== 'string' ||
          (!item.sourceUrl.startsWith('https://') && !item.sourceUrl.startsWith('http://'))
        ) {
          errors.push(`${prefix}: quizAvailable item must have a valid http(s) sourceUrl.`);
        }
        if (!Array.isArray(item.questions) || item.questions.length !== 2) {
          errors.push(`${prefix}: quizAvailable item must have exactly 2 questions.`);
        } else {
          summary.totalQuestions += item.questions.length;
          const seenQIds = new Set();
          item.questions.forEach((q, qIdx) => {
            const qPrefix = `${prefix}.questions[${qIdx}]`;
            if (!q || typeof q !== 'object') {
              errors.push(`${qPrefix}: must be an object.`);
              return;
            }
            if (typeof q.id !== 'string' || q.id.trim() === '') {
              errors.push(`${qPrefix}: missing id.`);
            } else if (seenQIds.has(q.id)) {
              errors.push(`${qPrefix}: duplicate question id "${q.id}".`);
            } else {
              seenQIds.add(q.id);
            }
            if (typeof q.prompt !== 'string' || q.prompt.trim() === '') {
              errors.push(`${qPrefix}: missing prompt.`);
            }
            if (!Array.isArray(q.choices) || q.choices.length !== 4) {
              errors.push(`${qPrefix}: must have exactly 4 choices.`);
            } else {
              const choiceSet = new Set();
              q.choices.forEach((c, cIdx) => {
                if (typeof c !== 'string' || c.trim() === '') {
                  errors.push(`${qPrefix}.choices[${cIdx}]: must be a non-empty string.`);
                } else {
                  choiceSet.add(c.trim());
                }
              });
              if (choiceSet.size !== 4) {
                errors.push(`${qPrefix}: all 4 choices must be distinct.`);
              }
            }
            if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) {
              errors.push(`${qPrefix}: answerIndex must be an integer between 0 and 3.`);
            }
          });
        }
      } else {
        summary.quizUnavailableCount += 1;
        if (!Array.isArray(item.questions) || item.questions.length !== 0) {
          errors.push(`${prefix}: quizAvailable: false item must have an empty questions array.`);
        }
        if (typeof item.reason !== 'string' || item.reason.trim() === '') {
          errors.push(`${prefix}: quizAvailable: false item must include a reason.`);
        }
      }
    });

    if (speakerMap.size > 0) {
      speakerMap.forEach((_speaker, speakerId) => {
        if (!seenSpeakerIds.has(speakerId)) {
          errors.push(`Missing comprehension entry for speakerId "${speakerId}".`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      summary,
    };
  }

  /**
   * Partitions speakers into calibration (8 non-quiz speakers) and holdout (4 quiz speakers).
   */
  function partitionExperimentSpeakers(speakers, comprehensionMap) {
    const list = Array.isArray(speakers) ? speakers : [];
    const compMap = comprehensionMap && typeof comprehensionMap === 'object' ? comprehensionMap : null;
    const defaultHoldoutSet = new Set(HOLDOUT_SPEAKER_IDS);

    const calibration = [];
    const holdout = [];

    for (const speaker of list) {
      if (!speaker || typeof speaker.id !== 'string') continue;
      const isHoldout = compMap
        ? Boolean(compMap[speaker.id] && compMap[speaker.id].quizAvailable === true)
        : defaultHoldoutSet.has(speaker.id);
      if (isHoldout) {
        holdout.push(speaker);
      } else {
        calibration.push(speaker);
      }
    }

    return {
      calibration,
      holdout,
      calibrationIds: calibration.map((s) => s.id),
      holdoutIds: holdout.map((s) => s.id),
    };
  }

  /**
   * Computes calibration progress across the 8 non-quiz calibration speakers.
   */
  function getCalibrationStatus(speakers, ratingsMap, comprehensionMap) {
    const ratings = ratingsMap && typeof ratingsMap === 'object' ? ratingsMap : {};
    const { calibration, holdout } = partitionExperimentSpeakers(speakers, comprehensionMap);
    const completedSpeakerIds = [];
    const remainingSpeakerIds = [];

    for (const speaker of calibration) {
      if (scoreEvaluation(ratings[speaker.id]) !== null) {
        completedSpeakerIds.push(speaker.id);
      } else {
        remainingSpeakerIds.push(speaker.id);
      }
    }

    return {
      total: calibration.length,
      holdoutTotal: holdout.length,
      completedCount: completedSpeakerIds.length,
      completedSpeakerIds,
      remainingSpeakerIds,
      isComplete: calibration.length > 0 && remainingSpeakerIds.length === 0,
    };
  }

  /**
   * Validates persisted or in-memory Holdout experiment state structure.
   */
  function isValidExperimentState(experiment) {
    if (!experiment || typeof experiment !== 'object') return false;
    if (experiment.locked !== true) return false;
    if (typeof experiment.algorithmVersion !== 'string' || experiment.algorithmVersion.trim() === '') {
      return false;
    }
    if (typeof experiment.frozenAt !== 'string' || experiment.frozenAt.trim() === '') {
      return false;
    }
    if (!experiment.predictions || typeof experiment.predictions !== 'object') return false;
    if (!Array.isArray(experiment.queue) || experiment.queue.length === 0) return false;
    if (!Array.isArray(experiment.results)) return false;

    for (const item of experiment.queue) {
      if (!item || typeof item !== 'object' || typeof item.speakerId !== 'string') return false;
      if (item.group !== 'recommended' && item.group !== 'random') return false;
      if (
        typeof item.predictedScore !== 'number' ||
        !Number.isFinite(item.predictedScore) ||
        item.predictedScore < 0 ||
        item.predictedScore > 1
      ) {
        return false;
      }
      const predEntry = experiment.predictions[item.speakerId];
      if (!predEntry || predEntry.predictedScore !== item.predictedScore) return false;
    }

    return true;
  }

  function cloneExperimentState(experiment) {
    const predictionsCopy = {};
    Object.keys(experiment.predictions).forEach((key) => {
      predictionsCopy[key] = { ...experiment.predictions[key] };
    });
    return {
      ...experiment,
      calibrationSpeakerIds: Array.isArray(experiment.calibrationSpeakerIds)
        ? experiment.calibrationSpeakerIds.slice()
        : [],
      holdoutSpeakerIds: Array.isArray(experiment.holdoutSpeakerIds)
        ? experiment.holdoutSpeakerIds.slice()
        : [],
      calibrationSummary: experiment.calibrationSummary
        ? { ...experiment.calibrationSummary }
        : null,
      predictions: predictionsCopy,
      queue: experiment.queue.map((q) => ({ ...q })),
      results: experiment.results.map((r) => ({
        ...r,
        rating: r.rating ? { ...r.rating } : null,
        quizSelectedIndices: Array.isArray(r.quizSelectedIndices)
          ? r.quizSelectedIndices.slice()
          : [],
      })),
    };
  }

  /**
   * Freezes predictScore for all 4 holdout speakers once all 8 calibration speakers are rated.
   * Immutability contract: if existingExperiment is already locked, returns it completely unchanged
   * regardless of any subsequent changes to ratingsMap or Earprint profile.
   */
  function freezeHoldoutPredictions(existingExperiment, speakers, ratingsMap, options) {
    if (isValidExperimentState(existingExperiment)) {
      return {
        status: 'already_locked',
        changed: false,
        experiment: cloneExperimentState(existingExperiment),
      };
    }

    const opts = options && typeof options === 'object' ? options : {};
    const compMap =
      opts.comprehensionMap && typeof opts.comprehensionMap === 'object'
        ? opts.comprehensionMap
        : null;
    const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    const startGroup = opts.startGroup === 'random' ? 'random' : 'recommended';

    const partition = partitionExperimentSpeakers(speakers, compMap);
    const calStatus = getCalibrationStatus(speakers, ratingsMap, compMap);

    if (!calStatus.isComplete || partition.holdout.length === 0) {
      return {
        status: 'calibration_incomplete',
        changed: false,
        experiment: null,
        calibration: calStatus,
      };
    }

    // Build calibration-only ratings map to prevent holdout leakage
    const ratings = ratingsMap && typeof ratingsMap === 'object' ? ratingsMap : {};
    const calibrationRatings = {};
    for (const calSpeaker of partition.calibration) {
      if (scoreEvaluation(ratings[calSpeaker.id]) !== null) {
        calibrationRatings[calSpeaker.id] = ratings[calSpeaker.id];
      }
    }

    const calibrationProfile = computeEarprintProfile(speakers, calibrationRatings);
    const holdoutMap = new Map(partition.holdout.map((s) => [s.id, s]));
    const recResult = recommendSpeakers(speakers, calibrationRatings, {
      limit: Array.isArray(speakers) ? speakers.length : 12,
    });
    const rankedHoldout = recResult.recommendations.filter((rec) =>
      holdoutMap.has(rec.speaker.id)
    );
    const recScoreById = new Map(
      rankedHoldout.map((rec) => [rec.speaker.id, rec.matchScore])
    );

    const remainingIds = new Set(partition.holdoutIds);
    const queue = [];
    const predictions = {};
    let currentGroup = startGroup;

    while (remainingIds.size > 0) {
      let chosenSpeaker = null;
      if (currentGroup === 'recommended') {
        const topRec = rankedHoldout.find((rec) => remainingIds.has(rec.speaker.id));
        chosenSpeaker = topRec
          ? topRec.speaker
          : holdoutMap.get(Array.from(remainingIds)[0]);
      } else {
        const pool = Array.from(remainingIds);
        const rawRand = Number(rng());
        const safeRand = Number.isFinite(rawRand)
          ? Math.min(Math.max(rawRand, 0), 0.999999999999)
          : 0;
        const pickIndex = Math.floor(safeRand * pool.length);
        chosenSpeaker = holdoutMap.get(pool[pickIndex]);
      }

      if (!chosenSpeaker) break;
      remainingIds.delete(chosenSpeaker.id);

      const predScore = predictScore(calibrationProfile, chosenSpeaker);
      const safePred = predScore === null ? 0.5 : predScore;
      const entry = {
        speakerId: chosenSpeaker.id,
        group: currentGroup,
        predictedScore: safePred,
        predictedScorePct: Math.round(safePred * 100),
        matchScore: recScoreById.has(chosenSpeaker.id)
          ? recScoreById.get(chosenSpeaker.id)
          : null,
      };
      predictions[chosenSpeaker.id] = {
        ...entry,
        queueOrder: queue.length,
      };
      queue.push(entry);

      currentGroup = currentGroup === 'recommended' ? 'random' : 'recommended';
    }

    const algorithmVersion =
      typeof opts.algorithmVersion === 'string' && opts.algorithmVersion.trim() !== ''
        ? opts.algorithmVersion
        : ALGORITHM_VERSION;
    const algorithmVersionLabel =
      typeof opts.algorithmVersionLabel === 'string' && opts.algorithmVersionLabel.trim() !== ''
        ? opts.algorithmVersionLabel
        : `예측 모델 ${algorithmVersion}`;
    const frozenAt =
      typeof opts.now === 'string' && opts.now.trim() !== ''
        ? opts.now
        : new Date().toISOString();

    const experiment = {
      version: 1,
      locked: true,
      algorithmVersion,
      algorithmVersionLabel,
      frozenAt,
      calibrationSpeakerIds: partition.calibrationIds,
      holdoutSpeakerIds: partition.holdoutIds,
      calibrationSummary: {
        evaluatedCount: calibrationProfile.evaluatedCount,
        avgScore: calibrationProfile.avgScore,
        avgScorePct: calibrationProfile.avgScorePct,
      },
      predictions,
      queue,
      results: [],
    };

    return {
      status: 'frozen',
      changed: true,
      experiment,
    };
  }

  /**
   * Explicitly resets a Holdout experiment so a new freeze can occur.
   */
  function resetExperiment() {
    return null;
  }

  /**
   * Records a single Blind submission for a holdout speaker using strictly its frozen prediction.
   * Never alters frozen predictions, frozenAt, algorithmVersion, or queue.
   */
  function recordHoldoutResult(experiment, submission) {
    if (!isValidExperimentState(experiment)) {
      return { ok: false, error: 'Experiment is not locked.', experiment };
    }
    if (!submission || typeof submission !== 'object' || typeof submission.speakerId !== 'string') {
      return { ok: false, error: 'Invalid submission payload.', experiment };
    }

    const frozenEntry = experiment.predictions[submission.speakerId];
    if (!frozenEntry) {
      return { ok: false, error: 'Speaker is not in holdout set.', experiment };
    }
    if (experiment.results.some((r) => r && r.speakerId === submission.speakerId)) {
      return { ok: false, error: 'Speaker already recorded in experiment.', experiment };
    }

    const actual = computeActualScore(submission.rating, submission.quizResult || null);
    if (!actual) {
      return { ok: false, error: 'Invalid rating or quiz score.', experiment };
    }
    const err = computePredictionError(frozenEntry.predictedScore, actual.actualScore);
    if (!err) {
      return { ok: false, error: 'Invalid prediction error computation.', experiment };
    }

    const submittedAt =
      typeof submission.submittedAt === 'string' && submission.submittedAt.trim() !== ''
        ? submission.submittedAt
        : new Date().toISOString();

    const record = {
      id: `exp_${submittedAt}_${submission.speakerId}`,
      speakerId: submission.speakerId,
      group: frozenEntry.group,
      algorithmVersion: experiment.algorithmVersion,
      frozenAt: experiment.frozenAt,
      predictedScore: err.predictedScore,
      submittedAt,
      rating: {
        clarity: submission.rating.clarity,
        comprehension: Number(submission.rating.comprehension),
      },
      subjectiveScore: actual.subjectiveScore,
      quizAvailable: Boolean(submission.quizResult),
      quizSelectedIndices: Array.isArray(submission.quizSelectedIndices)
        ? submission.quizSelectedIndices.slice()
        : [],
      quizCorrectCount: submission.quizResult ? submission.quizResult.correctCount : null,
      quizTotalQuestions: submission.quizResult ? submission.quizResult.totalQuestions : 0,
      quizAccuracy: actual.quizAccuracy,
      actualScore: err.actualScore,
      actualMode: actual.mode,
      signedError: err.signedError,
      absError: err.absError,
    };

    const nextExperiment = cloneExperimentState(experiment);
    nextExperiment.results.push(record);

    return {
      ok: true,
      record,
      experiment: nextExperiment,
    };
  }

  /**
   * Produces pure numeric Holdout experiment summaries (overall, recommended vs random, and per-speaker).
   * Uncompleted holdout speakers remain masked to preserve Blind integrity.
   */
  function summarizeExperimentReport(experiment, speakers) {
    const speakerById = new Map(
      (Array.isArray(speakers) ? speakers : []).map((s) => [s.id, s])
    );

    if (!isValidExperimentState(experiment)) {
      const emptyGroup = summarizeGroupRecords([]);
      return {
        locked: false,
        algorithmVersion: null,
        algorithmVersionLabel: null,
        frozenAt: null,
        totalHoldoutCount: HOLDOUT_SPEAKER_IDS.length,
        completedCount: 0,
        overall: emptyGroup,
        recommended: emptyGroup,
        random: emptyGroup,
        bySpeaker: [],
      };
    }

    const groupReport = summarizePredictionReport(experiment.results);
    const validNormalizedAll = [];
    const resultBySpeakerId = new Map();

    for (const rec of experiment.results) {
      if (!rec || typeof rec !== 'object') continue;
      if (rec.group !== 'recommended' && rec.group !== 'random') continue;
      const err = computePredictionError(rec.predictedScore, rec.actualScore);
      if (!err) continue;
      resultBySpeakerId.set(rec.speakerId, { rec, err });
      validNormalizedAll.push({
        group: rec.group,
        predictedScore: err.predictedScore,
        actualScore: err.actualScore,
        absError: err.absError,
        signedError: err.signedError,
        quizAccuracy:
          typeof rec.quizAccuracy === 'number' &&
          Number.isFinite(rec.quizAccuracy) &&
          rec.quizAccuracy >= 0 &&
          rec.quizAccuracy <= 1
            ? rec.quizAccuracy
            : null,
        subjectiveScore:
          typeof rec.subjectiveScore === 'number' &&
          Number.isFinite(rec.subjectiveScore) &&
          rec.subjectiveScore >= 0 &&
          rec.subjectiveScore <= 1
            ? rec.subjectiveScore
            : rec.rating
              ? scoreEvaluation(rec.rating)
              : null,
        rating: rec.rating || null,
      });
    }

    const bySpeaker = experiment.queue.map((qItem, idx) => {
      const done = resultBySpeakerId.get(qItem.speakerId);
      if (!done) {
        return {
          queueIndex: idx,
          speakerId: null,
          speakerName: null,
          completed: false,
          group: null,
          predictedScore: null,
          predictedScorePct: null,
          actualScore: null,
          actualScorePct: null,
          quizAccuracy: null,
          quizAccuracyPct: null,
          quizCorrectCount: null,
          quizTotalQuestions: null,
          subjectiveScore: null,
          subjectiveScorePct: null,
          rating: null,
          absError: null,
          absErrorPct: null,
          signedError: null,
          signedErrorPct: null,
        };
      }

      const { rec, err } = done;
      const speaker = speakerById.get(qItem.speakerId);
      return {
        queueIndex: idx,
        speakerId: qItem.speakerId,
        speakerName: speaker ? speaker.name : qItem.speakerId,
        completed: true,
        group: rec.group,
        predictedScore: err.predictedScore,
        predictedScorePct: err.predictedScorePct,
        actualScore: err.actualScore,
        actualScorePct: err.actualScorePct,
        quizAccuracy: rec.quizAccuracy,
        quizAccuracyPct:
          typeof rec.quizAccuracy === 'number' ? roundTo(rec.quizAccuracy * 100, 1) : null,
        quizCorrectCount: rec.quizCorrectCount,
        quizTotalQuestions: rec.quizTotalQuestions,
        subjectiveScore: rec.subjectiveScore,
        subjectiveScorePct:
          typeof rec.subjectiveScore === 'number'
            ? roundTo(rec.subjectiveScore * 100, 1)
            : null,
        rating: rec.rating ? { ...rec.rating } : null,
        absError: err.absError,
        absErrorPct: err.absErrorPct,
        signedError: err.signedError,
        signedErrorPct: err.signedErrorPct,
      };
    });

    return {
      locked: true,
      algorithmVersion: experiment.algorithmVersion,
      algorithmVersionLabel:
        experiment.algorithmVersionLabel || `예측 모델 ${experiment.algorithmVersion}`,
      frozenAt: experiment.frozenAt,
      totalHoldoutCount: experiment.queue.length,
      completedCount: validNormalizedAll.length,
      overall: summarizeGroupRecords(validNormalizedAll),
      recommended: groupReport.recommended,
      random: groupReport.random,
      bySpeaker,
    };
  }

  return {
    CLARITY_SCORES,
    CLARITY_LABELS,
    PACE_LABELS,
    ACCENT_LABELS,
    TOPIC_LABELS,
    FEATURE_WEIGHTS,
    PREDICTION_WEIGHTS,
    ACTUAL_SCORE_WEIGHTS,
    HIGH_SCORE_THRESHOLD,
    VIDEO_ID_REGEX,
    ALGORITHM_VERSION,
    ALGORITHM_VERSION_LABEL,
    EARPRINT_MIN_TRAIT_SAMPLES,
    EARPRINT_GATE_MESSAGE,
    ACOUSTIC_UNMEASURED_STATUS,
    UNMEASURED_ACOUSTIC_TRAITS,
    RECOMMENDATION_REASON_CHIPS,
    EXPERIMENT_STORAGE_KEY,
    HOLDOUT_SPEAKER_IDS,
    formatAccent,
    formatPace,
    formatTopic,
    scoreEvaluation,
    isHighRating,
    computeSpeakerSimilarity,
    buildRecommendationReason,
    computeEarprintProfile,
    buildEarprintTraits,
    classifyRecommendationReasons,
    recommendSpeakers,
    validateSpeakersData,
    predictScore,
    gradeQuiz,
    computeActualScore,
    computePredictionError,
    buildPredictionSession,
    summarizePredictionReport,
    validateComprehensionData,
    partitionExperimentSpeakers,
    getCalibrationStatus,
    isValidExperimentState,
    freezeHoldoutPredictions,
    resetExperiment,
    recordHoldoutResult,
    summarizeExperimentReport,
  };
});
