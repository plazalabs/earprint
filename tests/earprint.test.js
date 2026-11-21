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

// ===== v3 Tests: Holdout Experiment Immutability, Reason Chips, Earprint Traits Gate =====

function buildCompMap() {
  const map = {};
  for (const item of compData.items) {
    map[item.speakerId] = item;
  }
  return map;
}

function buildCalibrationRatings(compMap, ratingFn) {
  const { calibration } = matching.partitionExperimentSpeakers(speakers, compMap);
  const ratings = {};
  calibration.forEach((speaker, idx) => {
    ratings[speaker.id] = ratingFn(speaker, idx);
  });
  return ratings;
}

test('v3 Holdout partition & calibration status: splits exact 8 calibration and 4 holdout quiz speakers', () => {
  const compMap = buildCompMap();
  const partition = matching.partitionExperimentSpeakers(speakers, compMap);

  assert.equal(partition.calibration.length, 8);
  assert.equal(partition.holdout.length, 4);
  assert.deepEqual(
    partition.holdoutIds.slice().sort(),
    ['celeste-headlee', 'julian-treasure', 'ken-robinson', 'tim-urban']
  );
  for (const h of partition.holdout) {
    assert.equal(compMap[h.id].quizAvailable, true);
  }
  for (const c of partition.calibration) {
    assert.equal(compMap[c.id].quizAvailable, false);
  }

  const emptyStatus = matching.getCalibrationStatus(speakers, {}, compMap);
  assert.equal(emptyStatus.completedCount, 0);
  assert.equal(emptyStatus.total, 8);
  assert.equal(emptyStatus.isComplete, false);

  const partialRatings = {};
  partition.calibration.slice(0, 7).forEach((s) => {
    partialRatings[s.id] = { clarity: 'clear', comprehension: 4 };
  });
  // Even if holdout speakers are rated, calibration is still incomplete at 7/8
  partialRatings['ken-robinson'] = { clarity: 'clear', comprehension: 5 };
  const partialStatus = matching.getCalibrationStatus(speakers, partialRatings, compMap);
  assert.equal(partialStatus.completedCount, 7);
  assert.equal(partialStatus.isComplete, false);

  partialRatings[partition.calibration[7].id] = { clarity: 'moderate', comprehension: 3 };
  const doneStatus = matching.getCalibrationStatus(speakers, partialRatings, compMap);
  assert.equal(doneStatus.completedCount, 8);
  assert.equal(doneStatus.isComplete, true);
});

test('v3 Holdout freeze: refuses freeze before 8/8 calibration and freezes 4 holdout predictions with version, timestamp, and no holdout leakage', () => {
  const compMap = buildCompMap();
  const partition = matching.partitionExperimentSpeakers(speakers, compMap);

  const sevenRatings = {};
  partition.calibration.slice(0, 7).forEach((s) => {
    sevenRatings[s.id] = { clarity: 'clear', comprehension: 5 };
  });
  const incompleteRes = matching.freezeHoldoutPredictions(null, speakers, sevenRatings, {
    comprehensionMap: compMap,
    rng: () => 0.25,
    now: '2026-11-22T00:00:00.000Z',
  });
  assert.equal(incompleteRes.status, 'calibration_incomplete');
  assert.equal(incompleteRes.changed, false);
  assert.equal(incompleteRes.experiment, null);

  const fullCalRatings = buildCalibrationRatings(compMap, (s) =>
    s.accent === 'UK' ? { clarity: 'clear', comprehension: 5 } : { clarity: 'moderate', comprehension: 3 }
  );

  // Add a conflicting holdout rating to verify zero holdout data leakage into frozen predictions
  const ratingsWithHoldout = {
    ...fullCalRatings,
    'ken-robinson': { clarity: 'hard', comprehension: 1 },
  };

  const freezeClean = matching.freezeHoldoutPredictions(null, speakers, fullCalRatings, {
    comprehensionMap: compMap,
    rng: () => 0.25,
    now: '2026-11-22T00:05:00.000Z',
  });
  const freezeWithLeakAttempt = matching.freezeHoldoutPredictions(null, speakers, ratingsWithHoldout, {
    comprehensionMap: compMap,
    rng: () => 0.25,
    now: '2026-11-22T00:05:00.000Z',
  });

  assert.equal(freezeClean.status, 'frozen');
  assert.equal(freezeClean.changed, true);
  assert.equal(freezeClean.experiment.locked, true);
  assert.equal(freezeClean.experiment.algorithmVersion, 'v1');
  assert.equal(freezeClean.experiment.algorithmVersionLabel, '예측 모델 v1');
  assert.equal(freezeClean.experiment.frozenAt, '2026-11-22T00:05:00.000Z');
  assert.equal(freezeClean.experiment.queue.length, 4);
  assert.deepEqual(
    freezeClean.experiment.queue.map((q) => q.group),
    ['recommended', 'random', 'recommended', 'random']
  );

  // Must match predictScore on calibration-only profile (no leakage from holdout rating)
  assert.deepEqual(freezeWithLeakAttempt.experiment.predictions, freezeClean.experiment.predictions);

  const calProfile = matching.computeEarprintProfile(speakers, fullCalRatings);
  for (const hId of matching.HOLDOUT_SPEAKER_IDS) {
    const hSpeaker = speakers.find((s) => s.id === hId);
    assert.ok(freezeClean.experiment.predictions[hId]);
    assert.equal(
      freezeClean.experiment.predictions[hId].predictedScore,
      matching.predictScore(calProfile, hSpeaker)
    );
  }
});

test('v3 Holdout immutability: frozen predictions stay unchanged even after calibration ratings and Earprint profile change', () => {
  const compMap = buildCompMap();
  const initialRatings = buildCalibrationRatings(compMap, () => ({
    clarity: 'clear',
    comprehension: 5,
  }));

  const firstFreeze = matching.freezeHoldoutPredictions(null, speakers, initialRatings, {
    comprehensionMap: compMap,
    rng: () => 0.4,
    now: '2026-11-22T00:10:00.000Z',
  });
  assert.equal(firstFreeze.status, 'frozen');
  const snapshotBefore = JSON.parse(JSON.stringify(firstFreeze.experiment));

  // Mutate every single calibration rating to the opposite extreme (hard, 1)
  const flippedRatings = buildCalibrationRatings(compMap, () => ({
    clarity: 'hard',
    comprehension: 1,
  }));
  const liveProfileBefore = matching.computeEarprintProfile(speakers, initialRatings);
  const liveProfileAfter = matching.computeEarprintProfile(speakers, flippedRatings);
  const ken = speakers.find((s) => s.id === 'ken-robinson');
  assert.notEqual(
    matching.predictScore(liveProfileBefore, ken),
    matching.predictScore(liveProfileAfter, ken),
    'Sanity check: live predictScore must differ after profile mutation'
  );

  // Attempting to freeze again without explicit reset MUST preserve original frozen predictions verbatim
  const secondAttempt = matching.freezeHoldoutPredictions(
    firstFreeze.experiment,
    speakers,
    flippedRatings,
    {
      comprehensionMap: compMap,
      rng: () => 0.9,
      now: '2026-11-22T01:00:00.000Z',
    }
  );
  assert.equal(secondAttempt.status, 'already_locked');
  assert.equal(secondAttempt.changed, false);
  assert.deepEqual(secondAttempt.experiment, snapshotBefore);

  // Recording a holdout result MUST use the frozen predictedScore (not the mutated live profile)
  const recorded = matching.recordHoldoutResult(secondAttempt.experiment, {
    speakerId: 'ken-robinson',
    rating: { clarity: 'moderate', comprehension: 3 },
    quizResult: { correctCount: 1, totalQuestions: 2, accuracy: 0.5 },
    quizSelectedIndices: [0, 0],
    submittedAt: '2026-11-22T01:05:00.000Z',
  });
  assert.equal(recorded.ok, true);
  assert.equal(
    recorded.record.predictedScore,
    snapshotBefore.predictions['ken-robinson'].predictedScore
  );
  assert.deepEqual(recorded.experiment.predictions, snapshotBefore.predictions);
  assert.equal(recorded.experiment.frozenAt, snapshotBefore.frozenAt);
  assert.equal(recorded.experiment.algorithmVersion, snapshotBefore.algorithmVersion);
});

test('v3 Holdout explicit reset: allows new prediction freeze ONLY after resetExperiment()', () => {
  const compMap = buildCompMap();
  const highRatings = buildCalibrationRatings(compMap, () => ({
    clarity: 'clear',
    comprehension: 5,
  }));
  const lowRatings = buildCalibrationRatings(compMap, () => ({
    clarity: 'hard',
    comprehension: 1,
  }));

  const frozen1 = matching.freezeHoldoutPredictions(null, speakers, highRatings, {
    comprehensionMap: compMap,
    rng: () => 0.2,
    now: '2026-11-22T00:10:00.000Z',
  }).experiment;

  // Still locked -> cannot refreeze
  const blocked = matching.freezeHoldoutPredictions(frozen1, speakers, lowRatings, {
    comprehensionMap: compMap,
    rng: () => 0.2,
    now: '2026-11-22T00:20:00.000Z',
  });
  assert.equal(blocked.status, 'already_locked');
  assert.equal(blocked.changed, false);
  assert.equal(
    blocked.experiment.predictions['ken-robinson'].predictedScore,
    frozen1.predictions['ken-robinson'].predictedScore
  );

  // Explicit reset -> unlocks
  const cleared = matching.resetExperiment();
  assert.equal(cleared, null);

  // Now refreeze succeeds with updated lowRatings predictions and new frozenAt
  const refrozen = matching.freezeHoldoutPredictions(cleared, speakers, lowRatings, {
    comprehensionMap: compMap,
    rng: () => 0.2,
    now: '2026-11-22T00:30:00.000Z',
  });
  assert.equal(refrozen.status, 'frozen');
  assert.equal(refrozen.changed, true);
  assert.equal(refrozen.experiment.frozenAt, '2026-11-22T00:30:00.000Z');
  assert.ok(
    refrozen.experiment.predictions['ken-robinson'].predictedScore <
      frozen1.predictions['ken-robinson'].predictedScore
  );
});

test('v3 Holdout record & report: rejects duplicates, masks untested Blind items, and aggregates numeric metrics', () => {
  const compMap = buildCompMap();
  const calRatings = buildCalibrationRatings(compMap, (s) =>
    s.accent === 'UK' || s.accent === 'US'
      ? { clarity: 'clear', comprehension: 4 }
      : { clarity: 'moderate', comprehension: 3 }
  );

  let exp = matching.freezeHoldoutPredictions(null, speakers, calRatings, {
    comprehensionMap: compMap,
    rng: () => 0.3,
    now: '2026-11-22T00:40:00.000Z',
  }).experiment;

  // Record first speaker
  const firstId = exp.queue[0].speakerId;
  const r1 = matching.recordHoldoutResult(exp, {
    speakerId: firstId,
    rating: { clarity: 'clear', comprehension: 5 },
    quizResult: { correctCount: 2, totalQuestions: 2, accuracy: 1.0 },
    quizSelectedIndices: [0, 1],
    submittedAt: '2026-11-22T00:45:00.000Z',
  });
  assert.equal(r1.ok, true);
  exp = r1.experiment;

  // Duplicate submission rejected
  const dup = matching.recordHoldoutResult(exp, {
    speakerId: firstId,
    rating: { clarity: 'hard', comprehension: 1 },
    quizResult: { correctCount: 0, totalQuestions: 2, accuracy: 0 },
  });
  assert.equal(dup.ok, false);

  // Mid-experiment report masks the 3 untested speakers (Blind protection)
  const midReport = matching.summarizeExperimentReport(exp, speakers);
  assert.equal(midReport.completedCount, 1);
  assert.equal(midReport.bySpeaker.length, 4);
  assert.equal(midReport.bySpeaker[0].completed, true);
  assert.equal(midReport.bySpeaker[0].speakerId, firstId);
  assert.equal(midReport.bySpeaker[1].completed, false);
  assert.equal(midReport.bySpeaker[1].speakerId, null);
  assert.equal(midReport.bySpeaker[1].group, null);
  assert.equal(midReport.bySpeaker[1].predictedScore, null);

  // Complete remaining 3 holdout speakers
  for (let i = 1; i < exp.queue.length; i += 1) {
    const spId = exp.queue[i].speakerId;
    const isEven = i % 2 === 0;
    const res = matching.recordHoldoutResult(exp, {
      speakerId: spId,
      rating: isEven
        ? { clarity: 'clear', comprehension: 4 }
        : { clarity: 'moderate', comprehension: 2 },
      quizResult: isEven
        ? { correctCount: 2, totalQuestions: 2, accuracy: 1.0 }
        : { correctCount: 1, totalQuestions: 2, accuracy: 0.5 },
      quizSelectedIndices: [0, 1],
    });
    assert.equal(res.ok, true);
    exp = res.experiment;
  }

  const finalReport = matching.summarizeExperimentReport(exp, speakers);
  assert.equal(finalReport.completedCount, 4);
  assert.equal(finalReport.recommended.count, 2);
  assert.equal(finalReport.random.count, 2);
  assert.equal(finalReport.overall.count, 4);
  assert.ok(typeof finalReport.overall.avgAbsErrorPct === 'number');
  assert.ok(finalReport.bySpeaker.every((s) => s.completed === true && s.quizAccuracyPct !== null));
});

test('v3 Reason chips classification: emits only computable chips from the 4 allowed types', () => {
  const julian = speakers.find((s) => s.id === 'julian-treasure'); // UK, medium, communication/creativity
  const mcwilliams = speakers.find((s) => s.id === 'david-mcwilliams'); // Irish, fast, economics/society

  // Empty profile -> no chips
  assert.deepEqual(
    matching.classifyRecommendationReasons(julian, { speakers, ratingsMap: {} }),
    []
  );

  // All low ratings (contrast fallback) -> no positive chips
  assert.deepEqual(
    matching.classifyRecommendationReasons(julian, {
      speakers,
      ratingsMap: { 'ken-robinson': { clarity: 'hard', comprehension: 1 } },
    }),
    []
  );

  // Ken Robinson (UK, slow, education/creativity) rated high -> julian matches pace(adjacent), accent(UK), topic(creativity)
  const kenHighRatings = { 'ken-robinson': { clarity: 'clear', comprehension: 5 } };
  const julianChips = matching.classifyRecommendationReasons(julian, {
    speakers,
    ratingsMap: kenHighRatings,
  });
  assert.deepEqual(
    julianChips.map((c) => c.label),
    [
      '발화 속도가 비슷한 화자',
      '높은 이해도를 보인 악센트와 유사',
      '동일 주제에서 높은 이해도를 보임',
    ]
  );

  // Distant speaker with no matching pace/accent/topic -> empty array (never fabricates chips)
  assert.deepEqual(
    matching.classifyRecommendationReasons(mcwilliams, {
      speakers,
      ratingsMap: kenHighRatings,
    }),
    []
  );

  // If exact pace ('slow') is rated LOW while adjacent ('medium') is rated HIGH, do NOT emit pace chip for 'slow'
  const slowLowMedHigh = {
    'ken-robinson': { clarity: 'hard', comprehension: 1 }, // slow -> 0.0
    'julian-treasure': { clarity: 'clear', comprehension: 5 }, // medium -> 1.0
  };
  const slowCandidate = { id: 'x-slow', accent: 'Swedish', pace: 'slow', topics: ['economics'] };
  assert.deepEqual(
    matching.classifyRecommendationReasons(slowCandidate, {
      speakers,
      ratingsMap: slowLowMedHigh,
    }),
    []
  );

  // Unknown accent never emits accent chip
  const unknownAccentCand = { id: 'x-unk', accent: 'unknown', pace: 'fast', topics: ['economics'] };
  assert.equal(
    matching
      .classifyRecommendationReasons(unknownAccentCand, { speakers, ratingsMap: kenHighRatings })
      .some((c) => c.type === 'accent'),
    false
  );

  // High actual Blind/Holdout test score emits 4th chip; low actual score does NOT
  const withHighTest = matching.classifyRecommendationReasons(mcwilliams, {
    speakers,
    ratingsMap: kenHighRatings,
    predictionRecords: [{ speakerId: 'david-mcwilliams', actualScore: 0.85 }],
  });
  assert.deepEqual(
    withHighTest.map((c) => c.label),
    ['실제 테스트에서 높은 이해도를 기록']
  );

  const withLowTest = matching.classifyRecommendationReasons(mcwilliams, {
    speakers,
    ratingsMap: kenHighRatings,
    experimentResults: [{ speakerId: 'david-mcwilliams', actualScore: 0.3 }],
  });
  assert.deepEqual(withLowTest, []);
});

test('v3 Earprint traits & sample gate: blocks below minimum samples and unlocks measurable + unmeasured acoustic traits', () => {
  assert.equal(matching.EARPRINT_MIN_TRAIT_SAMPLES, 3);

  // 0, 1, 2 samples -> gated
  for (const count of [0, 1, 2]) {
    const partial = {};
    speakers.slice(0, count).forEach((s) => {
      partial[s.id] = { clarity: 'clear', comprehension: 5 };
    });
    const profile = matching.computeEarprintProfile(speakers, partial);
    const traits = matching.buildEarprintTraits(profile);
    assert.equal(traits.unlocked, false);
    assert.equal(traits.gateMessage, '분석 중 — 데이터가 쌓이면 열립니다');
    assert.equal(traits.measurable, null);
    assert.deepEqual(traits.acousticTraits, []);
  }

  // 3 samples -> unlocked with accent, pace, topic (including evaluation counts) and unmeasured acoustic placeholders
  const threeRatings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 }, // UK, slow, education/creativity
    'julian-treasure': { clarity: 'clear', comprehension: 4 }, // UK, medium, communication/creativity
    'david-malan': { clarity: 'hard', comprehension: 2 }, // US, fast, technology/education
  };
  const profile3 = matching.computeEarprintProfile(speakers, threeRatings);
  assert.ok(profile3.byTopic.length >= 3);
  const creativityTopic = profile3.byTopic.find((t) => t.key === 'creativity');
  assert.ok(creativityTopic);
  assert.equal(creativityTopic.count, 2);

  const traits3 = matching.buildEarprintTraits(profile3);
  assert.equal(traits3.unlocked, true);
  assert.equal(traits3.gateMessage, null);
  assert.equal(traits3.measurable.accent.items[0].count, 2);
  assert.ok(traits3.measurable.pace.items.length >= 3);
  assert.ok(traits3.measurable.topic.items.length >= 3);

  // Observational wording only (no deterministic ear-labeling phrasing)
  const forbiddenDeterministic = ['당신은', '이런 귀', '귀를 가졌', '타고난'];
  const observations = [
    profile3.summaryText,
    traits3.measurable.accent.observation,
    traits3.measurable.pace.observation,
    traits3.measurable.topic.observation,
  ];
  for (const text of observations) {
    assert.ok(typeof text === 'string' && text.length > 0);
    for (const phrase of forbiddenDeterministic) {
      assert.equal(text.includes(phrase), false, `Forbidden deterministic phrase: ${phrase}`);
    }
  }

  // Acoustic traits have NO fabricated numbers and exact unmeasured status
  assert.equal(traits3.acousticTraits.length, 3);
  for (const trait of traits3.acousticTraits) {
    assert.equal(trait.status, '분석 중 — 아직 측정하지 않는 특성');
    assert.equal('score' in trait, false);
    assert.equal('avgScore' in trait, false);
    assert.equal('avgScorePct' in trait, false);
  }
});

test('v3 UI static contract: isolates all 3 localStorage keys, shows model version, and forbids judgmental/deterministic wording', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const matchingJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'matching.js'), 'utf8');

  assert.ok(appJs.includes("const STORAGE_KEY = 'earprint_v1'"));
  assert.ok(appJs.includes("const PREDICTION_STORAGE_KEY = 'earprint_prediction_v1'"));
  assert.ok(appJs.includes("const EXPERIMENT_STORAGE_KEY = 'earprint_experiment_v1'"));
  assert.ok(matchingJs.includes('예측 모델 v1'));
  assert.ok(html.includes('분석 중 — 데이터가 쌓이면 열립니다'));
  assert.ok(matchingJs.includes('분석 중 — 아직 측정하지 않는 특성'));

  const expStart = html.indexOf('id="panel-experiment"');
  const expEnd = html.indexOf('</section>', expStart);
  const expHtml = html.slice(expStart, expEnd);
  assert.ok(expStart > 0 && expEnd > expStart);

  const forbiddenVerdictWords = ['우수', '우세', '승리', '입증', '성공', '더 좋', '더 높', '더 낮', '우월', '효과적'];
  for (const word of forbiddenVerdictWords) {
    assert.equal(
      expHtml.includes(word),
      false,
      `Experiment panel must not contain judgmental phrasing: "${word}"`
    );
  }

  const epStart = html.indexOf('id="panel-earprint"');
  const epEnd = html.indexOf('</section>', epStart);
  const epHtml = html.slice(epStart, epEnd);
  assert.ok(epStart > 0 && epEnd > epStart);

  const forbiddenDeterministic = ['당신은', '이런 귀', '귀를 가졌', '타고난'];
  for (const word of forbiddenDeterministic) {
    assert.equal(
      epHtml.includes(word),
      false,
      `Earprint panel must not contain deterministic phrasing: "${word}"`
    );
  }
});

test('v3 isValidExperimentState: rejects corrupted, unlocked, missing-metadata, or mismatched experiment payloads', () => {
  assert.equal(matching.isValidExperimentState(null), false);
  assert.equal(matching.isValidExperimentState({}), false);
  assert.equal(matching.isValidExperimentState({ locked: false }), false);
  assert.equal(
    matching.isValidExperimentState({
      locked: true,
      algorithmVersion: '',
      frozenAt: '2026-11-22T00:00:00.000Z',
      predictions: {},
      queue: [],
      results: [],
    }),
    false
  );
  assert.equal(
    matching.isValidExperimentState({
      locked: true,
      algorithmVersion: 'v1',
      frozenAt: '2026-11-22T00:00:00.000Z',
      predictions: { 'ken-robinson': { predictedScore: 0.7 } },
      queue: [{ speakerId: 'ken-robinson', group: 'recommended', predictedScore: 0.9 }],
      results: [],
    }),
    false
  );
});

test('v3 Holdout freeze (all-low calibration fallback): freezes valid [0, 1] predictions and alternating 2/2 queue even when all 8 calibration ratings are low', () => {
  const compMap = buildCompMap();
  const allLowRatings = buildCalibrationRatings(compMap, () => ({
    clarity: 'hard',
    comprehension: 1,
  }));

  const res = matching.freezeHoldoutPredictions(null, speakers, allLowRatings, {
    comprehensionMap: compMap,
    rng: () => 0.1,
    now: '2026-11-22T02:00:00.000Z',
  });
  assert.equal(res.status, 'frozen');
  assert.equal(res.experiment.queue.length, 4);
  assert.deepEqual(
    res.experiment.queue.map((q) => q.group),
    ['recommended', 'random', 'recommended', 'random']
  );
  for (const item of res.experiment.queue) {
    assert.ok(typeof item.predictedScore === 'number' && item.predictedScore >= 0 && item.predictedScore <= 1);
  }
});

test('v3 buildEarprintTraits: handles null profile safely and respects custom minSamples option', () => {
  const nullTraits = matching.buildEarprintTraits(null);
  assert.equal(nullTraits.unlocked, false);
  assert.equal(nullTraits.evaluatedCount, 0);
  assert.equal(nullTraits.gateMessage, '분석 중 — 데이터가 쌓이면 열립니다');

  const twoRatings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 },
    'julian-treasure': { clarity: 'moderate', comprehension: 3 },
  };
  const profile2 = matching.computeEarprintProfile(speakers, twoRatings);
  assert.equal(matching.buildEarprintTraits(profile2).unlocked, false);
  assert.equal(matching.buildEarprintTraits(profile2, { minSamples: 2 }).unlocked, true);
});


