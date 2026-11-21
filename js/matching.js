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

  /**
   * Builds a user's Earprint summary broken down by accent and estimated pace.
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
        topAccent: null,
        topPace: null,
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

    const topAccent = byAccent[0] || null;
    const topPace = byPace[0] || null;

    let summaryText = `총 ${evaluatedCount}명의 화자를 평가했습니다.`;
    if (topAccent && topPace) {
      summaryText = `현재까지 ${evaluatedCount}명 평가 기준, ${topAccent.label} 악센트(적합도 ${topAccent.avgScorePct}%)와 ${topPace.label} 속도(적합도 ${topPace.avgScorePct}%) 화자를 가장 잘 듣는 경향이 보입니다.`;
    }

    return {
      evaluatedCount,
      totalCount,
      avgScore,
      avgScorePct: Math.round(avgScore * 100),
      avgComprehension,
      byAccent,
      byPace,
      topAccent,
      topPace,
      summaryText,
    };
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

  return {
    CLARITY_SCORES,
    CLARITY_LABELS,
    PACE_LABELS,
    ACCENT_LABELS,
    TOPIC_LABELS,
    FEATURE_WEIGHTS,
    HIGH_SCORE_THRESHOLD,
    VIDEO_ID_REGEX,
    formatAccent,
    formatPace,
    formatTopic,
    scoreEvaluation,
    isHighRating,
    computeSpeakerSimilarity,
    buildRecommendationReason,
    computeEarprintProfile,
    recommendSpeakers,
    validateSpeakersData,
  };
});
