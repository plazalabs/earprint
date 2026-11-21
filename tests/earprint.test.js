'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const matching = require('../js/matching.js');

const SPEAKERS_PATH = path.join(__dirname, '..', 'data', 'speakers.json');
const rawData = JSON.parse(fs.readFileSync(SPEAKERS_PATH, 'utf8'));
const speakers = rawData.speakers;

test('speakers.json: contains exactly 12 real speakers and passes full validation', () => {
  assert.equal(Array.isArray(speakers), true);
  assert.equal(speakers.length, 12);

  const result = matching.validateSpeakersData(rawData);
  assert.equal(result.valid, true, `Validation errors: ${result.errors.join('; ')}`);
});

test('speakers.json: every speaker has required fields, unique id, and unique valid YouTube videoId', () => {
  const idSet = new Set();
  const primaryVideoIdSet = new Set();

  for (const speaker of speakers) {
    assert.ok(typeof speaker.id === 'string' && speaker.id.length > 0);
    assert.equal(idSet.has(speaker.id), false, `Duplicate speaker id: ${speaker.id}`);
    idSet.add(speaker.id);

    assert.ok(typeof speaker.name === 'string' && speaker.name.trim().length > 0);
    assert.ok(typeof speaker.channel === 'string' && speaker.channel.trim().length > 0);
    assert.ok(typeof speaker.accent === 'string' && speaker.accent.trim().length > 0);
    assert.ok(['slow', 'medium', 'fast'].includes(speaker.pace), `Invalid pace for ${speaker.id}`);
    assert.equal(speaker.paceEstimated, true, `paceEstimated must be true for ${speaker.id}`);
    assert.ok(speaker.paceLabel.includes('추정'), `paceLabel must include 추정 for ${speaker.id}`);

    assert.ok(Array.isArray(speaker.topics) && speaker.topics.length >= 1);
    assert.ok(matching.VIDEO_ID_REGEX.test(speaker.clip.videoId), `Invalid clip videoId: ${speaker.clip.videoId}`);
    assert.equal(primaryVideoIdSet.has(speaker.clip.videoId), false, `Duplicate clip videoId: ${speaker.clip.videoId}`);
    primaryVideoIdSet.add(speaker.clip.videoId);

    assert.equal(Number.isInteger(speaker.clip.startSeconds), true);
    assert.ok(speaker.clip.startSeconds >= 0);

    // No voice-inferred age/gender fields allowed
    assert.equal('age' in speaker, false, `Forbidden field age in ${speaker.id}`);
    assert.equal('gender' in speaker, false, `Forbidden field gender in ${speaker.id}`);
    assert.equal('sex' in speaker, false, `Forbidden field sex in ${speaker.id}`);

    // Content Explorer links validation
    assert.ok(Array.isArray(speaker.moreContent) && speaker.moreContent.length >= 2);
    for (const content of speaker.moreContent) {
      assert.ok(matching.VIDEO_ID_REGEX.test(content.videoId), `Invalid moreContent videoId: ${content.videoId}`);
      assert.equal(
        content.url,
        `https://www.youtube.com/watch?v=${content.videoId}`,
        `moreContent URL mismatch for ${speaker.id}`
      );
      assert.ok(typeof content.title === 'string' && content.title.trim().length > 0);
      assert.ok(typeof content.channel === 'string' && content.channel.trim().length > 0);
    }
  }
});

test('speakers.json: explicitly marks embedStatus as unverified on all 12 clips', () => {
  assert.equal(typeof rawData.verifiedAt, 'string');
  for (const speaker of speakers) {
    assert.equal(
      speaker.clip.embedStatus,
      'unverified',
      `embedStatus must remain unverified for ${speaker.id}`
    );
  }
});

test('validateSpeakersData: catches missing fields, duplicate IDs, bad videoIds, and forbidden demographics', () => {
  const broken = {
    speakers: [
      {
        id: 'dup-id',
        name: '',
        channel: 'TED',
        accent: 'US',
        pace: 'medium',
        paceEstimated: false,
        paceLabel: '보통',
        age: 40,
        topics: [],
        clip: { title: 'Test', videoId: 'bad-id', startSeconds: -5 },
        moreContent: [],
      },
      {
        id: 'dup-id',
        name: 'Second',
        channel: 'TED',
        accent: 'UK',
        pace: 'slow',
        paceEstimated: true,
        paceLabel: '느림 (추정)',
        topics: ['science'],
        clip: { title: 'Ok', videoId: 'ABCDEFGHIJK', startSeconds: 10 },
        moreContent: [
          {
            title: 'Bad link',
            channel: 'TED',
            videoId: 'short',
            url: 'https://example.com/not-youtube',
          },
        ],
      },
    ],
  };

  const result = matching.validateSpeakersData(broken);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('forbidden demographic field "age"')));
  assert.ok(result.errors.some((e) => e.includes('duplicate speaker id "dup-id"')));
  assert.ok(result.errors.some((e) => e.includes('invalid YouTube videoId "bad-id"')));
  assert.ok(result.errors.some((e) => e.includes('paceEstimated must be true')));
  assert.ok(result.errors.some((e) => e.includes('startSeconds must be a non-negative integer')));
  assert.ok(result.errors.some((e) => e.includes('url must be a valid YouTube watch URL')));
});

test('validateSpeakersData: rejects null, non-object, or missing speakers array inputs', () => {
  assert.equal(matching.validateSpeakersData(null).valid, false);
  assert.equal(matching.validateSpeakersData(undefined).valid, false);
  assert.equal(matching.validateSpeakersData({}).valid, false);
  assert.equal(matching.validateSpeakersData({ speakers: 'not-array' }).valid, false);
});

test('matching.js: runs purely in Node without browser DOM globals', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(typeof matching.scoreEvaluation, 'function');
  assert.equal(typeof matching.computeEarprintProfile, 'function');
  assert.equal(typeof matching.recommendSpeakers, 'function');
});

test('scoreEvaluation: calculates expected normalized scores and rejects invalid inputs', () => {
  assert.equal(matching.scoreEvaluation({ clarity: 'clear', comprehension: 5 }), 1);
  assert.equal(matching.scoreEvaluation({ clarity: 'moderate', comprehension: 3 }), 0.5);
  assert.equal(matching.scoreEvaluation({ clarity: 'hard', comprehension: 1 }), 0);
  assert.equal(matching.scoreEvaluation({ clarity: 'clear', comprehension: 3 }), 0.75);
  assert.equal(matching.scoreEvaluation({ clarity: 'unknown', comprehension: 3 }), null);
  assert.equal(matching.scoreEvaluation({ clarity: 'clear', comprehension: 0 }), null);
  assert.equal(matching.scoreEvaluation({ clarity: 'clear', comprehension: 6 }), null);
  assert.equal(matching.scoreEvaluation({ clarity: 'clear', comprehension: NaN }), null);
  assert.equal(matching.scoreEvaluation({ clarity: 'clear', comprehension: Infinity }), null);
  assert.equal(matching.scoreEvaluation(null), null);
  assert.equal(matching.scoreEvaluation(undefined), null);
  assert.equal(matching.scoreEvaluation('clear'), null);
});

test('isHighRating: respects exact positive threshold boundaries', () => {
  assert.equal(matching.isHighRating({ clarity: 'moderate', comprehension: 4 }), true); // 0.625
  assert.equal(matching.isHighRating({ clarity: 'clear', comprehension: 2 }), true); // 0.625
  assert.equal(matching.isHighRating({ clarity: 'moderate', comprehension: 3 }), false); // 0.5
  assert.equal(matching.isHighRating({ clarity: 'hard', comprehension: 5 }), false); // 0.5
  assert.equal(matching.isHighRating({ clarity: 'clear', comprehension: 1 }), false); // 0.5
  assert.equal(matching.isHighRating(null), false);
});

test('computeEarprintProfile: handles empty ratings and invalid root inputs cleanly', () => {
  const emptyProfile = matching.computeEarprintProfile(speakers, {});
  assert.equal(emptyProfile.evaluatedCount, 0);
  assert.equal(emptyProfile.totalCount, 12);
  assert.deepEqual(emptyProfile.byAccent, []);
  assert.deepEqual(emptyProfile.byPace, []);
  assert.ok(emptyProfile.summaryText.length > 0);

  const nullProfile = matching.computeEarprintProfile(null, null);
  assert.equal(nullProfile.evaluatedCount, 0);
  assert.equal(nullProfile.totalCount, 0);
  assert.deepEqual(nullProfile.byAccent, []);
});

test('computeEarprintProfile: ignores corrupted rating entries and unknown speaker IDs', () => {
  const mixedRatings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 },
    'celeste-headlee': { clarity: 'invalid-clarity', comprehension: 4 },
    'tim-urban': { clarity: 'clear', comprehension: 99 },
    'dan-gilbert': null,
    'non-existent-id': { clarity: 'clear', comprehension: 5 },
  };

  const profile = matching.computeEarprintProfile(speakers, mixedRatings);
  assert.equal(profile.evaluatedCount, 1);
  assert.equal(profile.avgScore, 1);
  assert.equal(profile.byAccent.length, 1);
  assert.equal(profile.byAccent[0].key, 'UK');
});

test('computeEarprintProfile: aggregates by accent and estimated pace and sorts highest first', () => {
  const ratings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 }, // UK, slow -> 1.0
    'julian-treasure': { clarity: 'clear', comprehension: 4 }, // UK, medium -> 0.875
    'david-malan': { clarity: 'hard', comprehension: 2 }, // US, fast -> 0.125
  };

  const profile = matching.computeEarprintProfile(speakers, ratings);
  assert.equal(profile.evaluatedCount, 3);
  assert.equal(profile.totalCount, 12);
  assert.equal(profile.byAccent[0].key, 'UK');
  assert.equal(profile.byAccent[0].count, 2);
  assert.ok(profile.byAccent[0].avgScore > profile.byAccent[1].avgScore);

  assert.equal(profile.byPace[0].key, 'slow');
  assert.ok(profile.byPace[0].label.includes('추정'));
  assert.ok(profile.summaryText.includes('영국 (UK)'));
  assert.ok(profile.summaryText.includes('느림 (추정)'));
});

test('computeEarprintProfile: breaks ties by count desc then key asc', () => {
  const syntheticSpeakers = [
    { id: 's1', name: 'A', accent: 'US', pace: 'slow', topics: ['science'] },
    { id: 's2', name: 'B', accent: 'US', pace: 'medium', topics: ['science'] },
    { id: 's3', name: 'C', accent: 'Australian', pace: 'fast', topics: ['science'] },
    { id: 's4', name: 'D', accent: 'UK', pace: 'fast', topics: ['science'] },
  ];
  const ratings = {
    s1: { clarity: 'clear', comprehension: 5 }, // US: avg 1.0, count 2
    s2: { clarity: 'clear', comprehension: 5 },
    s3: { clarity: 'clear', comprehension: 5 }, // Australian: avg 1.0, count 1
    s4: { clarity: 'clear', comprehension: 5 }, // UK: avg 1.0, count 1
  };

  const profile = matching.computeEarprintProfile(syntheticSpeakers, ratings);
  assert.deepEqual(
    profile.byAccent.map((g) => g.key),
    ['US', 'Australian', 'UK']
  );
});

test('computeSpeakerSimilarity: treats unknown accent as non-matching and ranks closer profiles higher', () => {
  const ref = { accent: 'UK', pace: 'slow', topics: ['education', 'creativity'] };
  const close = { accent: 'UK', pace: 'medium', topics: ['communication', 'creativity'] };
  const far = { accent: 'Irish', pace: 'fast', topics: ['economics', 'society'] };
  const unknownA = { accent: 'unknown', pace: 'slow', topics: ['education'] };
  const unknownB = { accent: 'unknown', pace: 'slow', topics: ['education'] };

  const simClose = matching.computeSpeakerSimilarity(close, ref);
  const simFar = matching.computeSpeakerSimilarity(far, ref);
  const simUnknown = matching.computeSpeakerSimilarity(unknownA, unknownB);

  assert.ok(simClose.score > simFar.score);
  assert.equal(simClose.accentMatch, 1);
  assert.deepEqual(simClose.sharedTopics, ['creativity']);
  assert.equal(simUnknown.accentMatch, 0);
});

test('buildRecommendationReason: generates accurate Korean reasons for exact, adjacent, and fallback matches', () => {
  const anchor = { id: 'a', name: 'Anchor Speaker', accent: 'UK', pace: 'slow', topics: ['education'] };
  const exactCand = { id: 'b', name: 'Exact', accent: 'UK', pace: 'slow', topics: ['education'] };
  const adjCand = { id: 'c', name: 'Adj', accent: 'US', pace: 'medium', topics: ['science'] };
  const noneCand = { id: 'd', name: 'None', accent: 'Irish', pace: 'fast', topics: ['economics'] };

  const exactReason = matching.buildRecommendationReason(
    exactCand,
    anchor,
    matching.computeSpeakerSimilarity(exactCand, anchor)
  );
  assert.ok(exactReason.includes('일치하며'));
  assert.ok(exactReason.includes('(추정)'));
  assert.ok(exactReason.includes('교육'));

  const adjReason = matching.buildRecommendationReason(
    adjCand,
    anchor,
    matching.computeSpeakerSimilarity(adjCand, anchor)
  );
  assert.ok(adjReason.includes('비슷하며'));
  assert.ok(adjReason.includes('(추정)'));

  const fallbackReason = matching.buildRecommendationReason(
    noneCand,
    anchor,
    matching.computeSpeakerSimilarity(noneCand, anchor)
  );
  assert.ok(fallbackReason.includes('Anchor Speaker'));
  assert.ok(fallbackReason.includes('후보'));
});

test('recommendSpeakers: returns no_ratings when ratings are empty or invalid', () => {
  const emptyRes = matching.recommendSpeakers(speakers, {}, { limit: 3 });
  assert.equal(emptyRes.status, 'no_ratings');
  assert.equal(emptyRes.recommendations.length, 0);

  const badInputRes = matching.recommendSpeakers(speakers, { 'ken-robinson': { clarity: 'bad', comprehension: 9 } });
  assert.equal(badInputRes.status, 'no_ratings');
  assert.equal(badInputRes.recommendations.length, 0);

  const nullSpeakersRes = matching.recommendSpeakers(null, null);
  assert.equal(nullSpeakersRes.status, 'no_ratings');
  assert.equal(nullSpeakersRes.recommendations.length, 0);
});

test('recommendSpeakers: recommends unrated UK/similar-feature speakers when Ken Robinson is rated high', () => {
  const ratings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 },
  };

  const result = matching.recommendSpeakers(speakers, ratings, { limit: 3 });
  assert.equal(result.status, 'matched');
  assert.equal(result.recommendations.length, 3);

  assert.equal(
    result.recommendations.some((r) => r.speaker.id === 'ken-robinson'),
    false
  );

  assert.equal(result.recommendations[0].speaker.id, 'julian-treasure');
  assert.ok(result.recommendations[0].reason.includes('Sir Ken Robinson'));
  assert.ok(result.recommendations[0].reason.includes('영국 (UK)'));
  assert.ok(result.recommendations[0].reason.includes('추정'));
});

test('recommendSpeakers: recommends US/medium psychology-adjacent speakers when Celeste Headlee is rated high', () => {
  const ratings = {
    'celeste-headlee': { clarity: 'clear', comprehension: 5 },
  };

  const result = matching.recommendSpeakers(speakers, ratings, { limit: 3 });
  assert.equal(result.status, 'matched');
  assert.equal(result.recommendations[0].speaker.id, 'dan-gilbert');
  assert.equal(result.recommendations[1].speaker.id, 'tim-urban');
  assert.ok(result.recommendations[0].reason.includes('Celeste Headlee'));
});

test('recommendSpeakers: falls back to contrast candidates when all ratings are low', () => {
  const ratings = {
    'david-malan': { clarity: 'hard', comprehension: 1 }, // US, fast, technology/education
  };

  const result = matching.recommendSpeakers(speakers, ratings, { limit: 3 });
  assert.equal(result.status, 'contrast_fallback');
  assert.equal(result.recommendations.length, 3);
  assert.equal(
    result.recommendations.some((r) => r.speaker.id === 'david-malan'),
    false
  );
  assert.notEqual(result.recommendations[0].speaker.accent, 'US');
  assert.notEqual(result.recommendations[0].speaker.pace, 'fast');
  assert.ok(result.recommendations[0].reason.includes('추정'));
});

test('recommendSpeakers: handles 11 of 12 rated (single unrated speaker left)', () => {
  const ratings = {};
  for (let i = 0; i < speakers.length - 1; i += 1) {
    ratings[speakers[i].id] = { clarity: 'clear', comprehension: 4 };
  }
  const remainingId = speakers[speakers.length - 1].id;
  const result = matching.recommendSpeakers(speakers, ratings, { limit: 3 });
  assert.equal(result.status, 'matched');
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].speaker.id, remainingId);
});

test('recommendSpeakers: returns all_rated when all 12 speakers are evaluated', () => {
  const allRatings = {};
  for (const s of speakers) {
    allRatings[s.id] = { clarity: 'clear', comprehension: 4 };
  }
  const result = matching.recommendSpeakers(speakers, allRatings, { limit: 3 });
  assert.equal(result.status, 'all_rated');
  assert.equal(result.recommendations.length, 0);
});

test('recommendSpeakers: resolves exact score ties deterministically by speaker id', () => {
  const tiePool = [
    { id: 'anchor', name: 'Anchor', accent: 'UK', pace: 'medium', topics: ['science'] },
    { id: 'zeta-speaker', name: 'Zeta', accent: 'UK', pace: 'medium', topics: ['science'] },
    { id: 'alpha-speaker', name: 'Alpha', accent: 'UK', pace: 'medium', topics: ['science'] },
  ];
  const ratings = { anchor: { clarity: 'clear', comprehension: 5 } };

  const result = matching.recommendSpeakers(tiePool, ratings, { limit: 2 });
  assert.equal(result.status, 'matched');
  assert.equal(result.recommendations[0].matchScore, result.recommendations[1].matchScore);
  assert.deepEqual(
    result.recommendations.map((r) => r.speaker.id),
    ['alpha-speaker', 'zeta-speaker']
  );
});

test('recommendSpeakers: safely normalizes limit option boundaries', () => {
  const ratings = { 'ken-robinson': { clarity: 'clear', comprehension: 5 } };

  assert.equal(matching.recommendSpeakers(speakers, ratings, { limit: 1 }).recommendations.length, 1);
  assert.equal(matching.recommendSpeakers(speakers, ratings, { limit: 20 }).recommendations.length, 11);
  assert.equal(matching.recommendSpeakers(speakers, ratings, { limit: 0 }).recommendations.length, 3);
  assert.equal(matching.recommendSpeakers(speakers, ratings, { limit: -5 }).recommendations.length, 3);
  assert.equal(matching.recommendSpeakers(speakers, ratings, { limit: 'bad' }).recommendations.length, 3);
});

test('recommendSpeakers: weights higher-rated anchor more strongly across multiple positive anchors', () => {
  const pool = [
    { id: 'high-anchor', name: 'High Anchor', accent: 'UK', pace: 'slow', topics: ['education'] },
    { id: 'mid-anchor', name: 'Mid Anchor', accent: 'US', pace: 'fast', topics: ['economics'] },
    { id: 'uk-match', name: 'UK Match', accent: 'UK', pace: 'slow', topics: ['education'] },
    { id: 'us-match', name: 'US Match', accent: 'US', pace: 'fast', topics: ['economics'] },
  ];
  const ratings = {
    'high-anchor': { clarity: 'clear', comprehension: 5 }, // score 1.0
    'mid-anchor': { clarity: 'moderate', comprehension: 4 }, // score 0.625
  };

  const result = matching.recommendSpeakers(pool, ratings, { limit: 2 });
  assert.equal(result.recommendations[0].speaker.id, 'uk-match');
  assert.equal(result.recommendations[0].anchorSpeakerId, 'high-anchor');
  assert.ok(result.recommendations[0].matchScore > result.recommendations[1].matchScore);
});

test('recommendSpeakers: produces deterministic results across repeated calls', () => {
  const ratings = {
    'celeste-headlee': { clarity: 'clear', comprehension: 4 },
    'hans-rosling': { clarity: 'moderate', comprehension: 4 },
  };
  const run1 = matching.recommendSpeakers(speakers, ratings, { limit: 5 });
  const run2 = matching.recommendSpeakers(speakers, ratings, { limit: 5 });
  assert.deepEqual(run1, run2);
});

// ===== v2 Tests: Objective Comprehension, Prediction, Error, Alternation & Report =====

const COMPREHENSION_PATH = path.join(__dirname, '..', 'data', 'comprehension.json');
const compData = JSON.parse(fs.readFileSync(COMPREHENSION_PATH, 'utf8'));

test('comprehension.json: passes full audit across all 12 speakers (segments, 2 questions, 4 choices, answerIndex, excerpts)', () => {
  const audit = matching.validateComprehensionData(compData, rawData);
  assert.equal(audit.valid, true, `Comprehension audit errors: ${audit.errors.join('; ')}`);
  assert.equal(audit.summary.totalSpeakers, 12);
  assert.equal(
    audit.summary.quizAvailableCount + audit.summary.quizUnavailableCount,
    12
  );
  assert.ok(audit.summary.quizAvailableCount >= 1);
  assert.equal(audit.summary.totalQuestions, audit.summary.quizAvailableCount * 2);

  const speakerMap = new Map(speakers.map((s) => [s.id, s]));
  for (const item of compData.items) {
    const speaker = speakerMap.get(item.speakerId);
    assert.ok(speaker, `Unknown speakerId ${item.speakerId}`);
    assert.equal(item.videoId, speaker.clip.videoId);
    assert.equal(item.startSeconds, speaker.clip.startSeconds);
    assert.equal(item.endSeconds - item.startSeconds, item.durationSeconds);
    assert.ok(item.durationSeconds >= 40 && item.durationSeconds <= 60);

    if (item.quizAvailable) {
      assert.equal(item.questions.length, 2);
      assert.ok(typeof item.sourceExcerpt === 'string' && item.sourceExcerpt.trim().length >= 20);
      assert.ok(typeof item.sourceUrl === 'string' && item.sourceUrl.startsWith('https://'));
      for (const q of item.questions) {
        assert.equal(q.choices.length, 4);
        assert.equal(Number.isInteger(q.answerIndex), true);
        assert.ok(q.answerIndex >= 0 && q.answerIndex <= 3);
      }
    } else {
      assert.deepEqual(item.questions, []);
      assert.ok(typeof item.reason === 'string' && item.reason.trim().length > 0);
    }
  }
});

test('validateComprehensionData: catches invalid question counts, choice counts, answerIndex bounds, missing excerpts, and bad durations', () => {
  const brokenComp = {
    items: [
      {
        speakerId: 'ken-robinson',
        videoId: 'iG9CE55wbtY',
        startSeconds: 60,
        endSeconds: 85, // 25s < 40s
        durationSeconds: 25,
        quizAvailable: true,
        sourceExcerpt: '',
        sourceUrl: 'not-a-url',
        questions: [
          {
            id: 'q1',
            prompt: 'Only one question',
            choices: ['A', 'B', 'C'], // only 3 choices
            answerIndex: 5, // out of range
          },
        ],
      },
    ],
  };

  const result = matching.validateComprehensionData(brokenComp, { speakers: [speakers[0]] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('between 40 and 60')));
  assert.ok(result.errors.some((e) => e.includes('sourceExcerpt')));
  assert.ok(result.errors.some((e) => e.includes('sourceUrl')));
  assert.ok(result.errors.some((e) => e.includes('exactly 2 questions')));
});

test('predictScore: runs without DOM and rejects empty/invalid profile or speaker inputs', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof matching.predictScore, 'function');

  const emptyProfile = matching.computeEarprintProfile(speakers, {});
  assert.equal(matching.predictScore(emptyProfile, speakers[0]), null);
  assert.equal(matching.predictScore(null, speakers[0]), null);
  assert.equal(matching.predictScore(emptyProfile, null), null);
  assert.equal(matching.predictScore({ evaluatedCount: 1, avgScore: NaN }, speakers[0]), null);
});

test('predictScore: predicts higher scores for matched accent/pace than poorly-rated features and stays in [0, 1]', () => {
  const ratings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 }, // UK, slow -> 1.0
    'david-malan': { clarity: 'hard', comprehension: 1 }, // US, fast -> 0.0
  };
  const profile = matching.computeEarprintProfile(speakers, ratings);

  const ukSlowScore = matching.predictScore(profile, { id: 'x1', accent: 'UK', pace: 'slow' });
  const ukMedScore = matching.predictScore(profile, { id: 'x2', accent: 'UK', pace: 'medium' });
  const unseenScore = matching.predictScore(profile, { id: 'x3', accent: 'Swedish', pace: 'medium' });
  const usFastScore = matching.predictScore(profile, { id: 'x4', accent: 'US', pace: 'fast' });

  assert.equal(ukSlowScore, 0.9);
  assert.equal(ukMedScore, 0.725);
  assert.equal(unseenScore, 0.5);
  assert.equal(usFastScore, 0.1);
  assert.ok(ukSlowScore > ukMedScore);
  assert.ok(ukMedScore > unseenScore);
  assert.ok(unseenScore > usFastScore);

  for (const s of speakers) {
    const score = matching.predictScore(profile, s);
    assert.ok(typeof score === 'number' && score >= 0 && score <= 1);
  }
});

test('predictScore: differentiates seen vs unseen features even with a single high rating and handles unknown accent', () => {
  const ratings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 }, // UK, slow -> 1.0
  };
  const profile = matching.computeEarprintProfile(speakers, ratings);

  const ukSlow = matching.predictScore(profile, { accent: 'UK', pace: 'slow' });
  const ukMedium = matching.predictScore(profile, { accent: 'UK', pace: 'medium' });
  const usFast = matching.predictScore(profile, { accent: 'US', pace: 'fast' });
  const unknownAccent = matching.predictScore(profile, { accent: 'unknown', pace: 'fast' });

  assert.ok(ukSlow > ukMedium);
  assert.ok(ukMedium > usFast);
  assert.equal(usFast, unknownAccent);
});

test('gradeQuiz: grades 2-question 4-choice answers accurately and rejects malformed inputs', () => {
  const sampleQs = compData.items.find((i) => i.quizAvailable).questions;
  const allRight = matching.gradeQuiz(sampleQs, [sampleQs[0].answerIndex, sampleQs[1].answerIndex]);
  assert.equal(allRight.correctCount, 2);
  assert.equal(allRight.totalQuestions, 2);
  assert.equal(allRight.accuracy, 1);
  assert.equal(allRight.accuracyPct, 100);
  assert.deepEqual(allRight.itemResults, [true, true]);

  const wrongIdx0 = (sampleQs[0].answerIndex + 1) % 4;
  const halfRight = matching.gradeQuiz(sampleQs, [wrongIdx0, sampleQs[1].answerIndex]);
  assert.equal(halfRight.correctCount, 1);
  assert.equal(halfRight.accuracy, 0.5);
  assert.deepEqual(halfRight.itemResults, [false, true]);

  assert.equal(matching.gradeQuiz(sampleQs, [0]), null);
  assert.equal(matching.gradeQuiz(sampleQs, [0, 4]), null);
  assert.equal(matching.gradeQuiz(sampleQs, [-1, 0]), null);
  assert.equal(matching.gradeQuiz([], []), null);
});

test('computeActualScore & computePredictionError: compute exact combined, subjective-only, signed, and absolute errors', () => {
  const combined = matching.computeActualScore(
    { clarity: 'clear', comprehension: 3 }, // subjective = 0.75
    { accuracy: 0.5 }
  );
  assert.equal(combined.mode, 'combined');
  assert.equal(combined.subjectiveScore, 0.75);
  assert.equal(combined.quizAccuracy, 0.5);
  assert.equal(combined.actualScore, 0.625);

  const subjOnly = matching.computeActualScore({ clarity: 'moderate', comprehension: 4 }, null);
  assert.equal(subjOnly.mode, 'subjective_only');
  assert.equal(subjOnly.actualScore, 0.625);
  assert.equal(subjOnly.quizAccuracy, null);

  assert.equal(matching.computeActualScore({ clarity: 'bad', comprehension: 3 }, null), null);

  const errPos = matching.computePredictionError(0.8, 0.625);
  assert.equal(errPos.signedError, 0.175);
  assert.equal(errPos.absError, 0.175);
  assert.equal(errPos.signedErrorPct, 17.5);
  assert.equal(errPos.absErrorPct, 17.5);

  const errNeg = matching.computePredictionError(0.4, 0.75);
  assert.equal(errNeg.signedError, -0.35);
  assert.equal(errNeg.absError, 0.35);
  assert.equal(errNeg.signedErrorPct, -35);
  assert.equal(errNeg.absErrorPct, 35);

  const errZero = matching.computePredictionError(0.5, 0.5);
  assert.equal(errZero.absError, 0);
  assert.equal(errZero.signedError, 0);

  assert.equal(matching.computePredictionError(-0.1, 0.5), null);
  assert.equal(matching.computePredictionError(0.5, 1.2), null);
  assert.equal(matching.computePredictionError(NaN, 0.5), null);
});

test('buildPredictionSession: strictly alternates recommended and random without duplicates and freezes predictedScore', () => {
  const ratings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 },
    'david-malan': { clarity: 'hard', comprehension: 1 },
  };
  let seed = 0.37;
  const fakeRng = () => {
    seed = (seed * 7 + 0.13) % 1;
    return seed;
  };

  const session = matching.buildPredictionSession(speakers, ratings, {
    rng: fakeRng,
    startGroup: 'recommended',
  });

  assert.equal(session.status, 'ready');
  assert.equal(session.queue.length, 10);
  assert.equal(session.recommendedCount, 5);
  assert.equal(session.randomCount, 5);

  const seenIds = new Set();
  session.queue.forEach((item, idx) => {
    const expectedGroup = idx % 2 === 0 ? 'recommended' : 'random';
    assert.equal(item.group, expectedGroup);
    assert.equal(seenIds.has(item.speaker.id), false);
    assert.equal(item.speaker.id in ratings, false);
    assert.ok(typeof item.predictedScore === 'number' && item.predictedScore >= 0 && item.predictedScore <= 1);
    seenIds.add(item.speaker.id);
  });

  // First recommended speaker should be top recommendation for Ken Robinson (UK) -> julian-treasure
  assert.equal(session.queue[0].speaker.id, 'julian-treasure');
});

test('buildPredictionSession: respects excludeIds, startGroup=random, quizOnly, and empty boundary states', () => {
  const noRatingSession = matching.buildPredictionSession(speakers, {});
  assert.equal(noRatingSession.status, 'no_ratings');
  assert.deepEqual(noRatingSession.queue, []);

  const ratings = { 'ken-robinson': { clarity: 'clear', comprehension: 5 } };
  const compMap = {};
  compData.items.forEach((item) => {
    compMap[item.speakerId] = item;
  });

  const quizOnlySession = matching.buildPredictionSession(speakers, ratings, {
    startGroup: 'random',
    quizOnly: true,
    comprehensionMap: compMap,
    rng: () => 0.5,
  });
  assert.equal(quizOnlySession.status, 'ready');
  assert.equal(quizOnlySession.queue.length, 3); // 4 quiz speakers minus rated ken-robinson
  assert.deepEqual(
    quizOnlySession.queue.map((q) => q.group),
    ['random', 'recommended', 'random']
  );

  const allExcluded = speakers.map((s) => s.id);
  const exhausted = matching.buildPredictionSession(speakers, ratings, { excludeIds: allExcluded });
  assert.equal(exhausted.status, 'no_candidates');
  assert.deepEqual(exhausted.queue, []);
});

test('summarizePredictionReport: aggregates recommended vs random numerically and ignores malformed entries', () => {
  const emptyReport = matching.summarizePredictionReport([]);
  assert.equal(emptyReport.totalCount, 0);
  assert.equal(emptyReport.recommended.count, 0);
  assert.equal(emptyReport.random.count, 0);
  assert.equal(emptyReport.recommended.avgActualScore, null);
  assert.equal(emptyReport.random.avgAbsError, null);

  const records = [
    {
      group: 'recommended',
      predictedScore: 0.8,
      actualScore: 0.9,
      quizAccuracy: 1.0,
      subjectiveScore: 0.8,
      rating: { clarity: 'clear', comprehension: 4 },
    },
    {
      group: 'recommended',
      predictedScore: 0.7,
      actualScore: 0.6,
      quizAccuracy: null,
      subjectiveScore: 0.6,
      rating: { clarity: 'moderate', comprehension: 4 },
    },
    {
      group: 'random',
      predictedScore: 0.5,
      actualScore: 0.3,
      quizAccuracy: 0.5,
      subjectiveScore: 0.1,
      rating: { clarity: 'hard', comprehension: 2 },
    },
    // Malformed entries must be safely ignored
    { group: 'unknown', predictedScore: 0.5, actualScore: 0.5 },
    { group: 'random', predictedScore: 2.0, actualScore: 0.5 },
    null,
  ];

  const summary = matching.summarizePredictionReport(records);
  assert.equal(summary.totalCount, 3);

  assert.equal(summary.recommended.count, 2);
  assert.equal(summary.recommended.avgActualScorePct, 75);
  assert.equal(summary.recommended.quizSampleCount, 1);
  assert.equal(summary.recommended.avgQuizAccuracyPct, 100);
  assert.equal(summary.recommended.avgSubjectiveComprehension, 4);
  assert.equal(summary.recommended.avgAbsErrorPct, 10);

  assert.equal(summary.random.count, 1);
  assert.equal(summary.random.avgActualScorePct, 30);
  assert.equal(summary.random.quizSampleCount, 1);
  assert.equal(summary.random.avgQuizAccuracyPct, 50);
  assert.equal(summary.random.avgSubjectiveComprehension, 2);
  assert.equal(summary.random.avgAbsErrorPct, 20);
});

test('UI static contract: separates earprint_v1 and earprint_prediction_v1 keys and omits judgmental wording in report panel', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

  assert.ok(appJs.includes("const STORAGE_KEY = 'earprint_v1'"));
  assert.ok(appJs.includes("const PREDICTION_STORAGE_KEY = 'earprint_prediction_v1'"));

  const reportStart = html.indexOf('id="panel-report"');
  const reportEnd = html.indexOf('</section>', reportStart);
  const reportHtml = html.slice(reportStart, reportEnd);
  assert.ok(reportStart > 0 && reportEnd > reportStart);

  const forbiddenVerdictWords = ['우수', '우세', '승리', '입증', '성공', '더 좋', '더 높', '더 낮'];
  for (const word of forbiddenVerdictWords) {
    assert.equal(
      reportHtml.includes(word),
      false,
      `Report panel must not contain judgmental phrasing: "${word}"`
    );
  }
});
