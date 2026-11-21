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
  assert.equal(matching.scoreEvaluation(null), null);
});

test('computeEarprintProfile: handles empty ratings cleanly', () => {
  const profile = matching.computeEarprintProfile(speakers, {});
  assert.equal(profile.evaluatedCount, 0);
  assert.equal(profile.totalCount, 12);
  assert.deepEqual(profile.byAccent, []);
  assert.deepEqual(profile.byPace, []);
  assert.ok(profile.summaryText.length > 0);
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

test('recommendSpeakers: returns no_ratings when ratings are empty', () => {
  const result = matching.recommendSpeakers(speakers, {}, { limit: 3 });
  assert.equal(result.status, 'no_ratings');
  assert.equal(result.recommendations.length, 0);
});

test('recommendSpeakers: recommends unrated UK/similar-feature speakers when Ken Robinson is rated high', () => {
  const ratings = {
    'ken-robinson': { clarity: 'clear', comprehension: 5 },
  };

  const result = matching.recommendSpeakers(speakers, ratings, { limit: 3 });
  assert.equal(result.status, 'matched');
  assert.equal(result.recommendations.length, 3);

  // Already rated speaker must never appear in recommendations
  assert.equal(
    result.recommendations.some((r) => r.speaker.id === 'ken-robinson'),
    false
  );

  // Top recommendation should be Julian Treasure (UK + medium(close) + creativity topic overlap)
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
  // Top contrast candidate should not share US accent or fast pace
  assert.notEqual(result.recommendations[0].speaker.accent, 'US');
  assert.notEqual(result.recommendations[0].speaker.pace, 'fast');
  assert.ok(result.recommendations[0].reason.includes('추정'));
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

test('recommendSpeakers: produces deterministic results across repeated calls', () => {
  const ratings = {
    'celeste-headlee': { clarity: 'clear', comprehension: 4 },
    'hans-rosling': { clarity: 'moderate', comprehension: 4 },
  };
  const run1 = matching.recommendSpeakers(speakers, ratings, { limit: 5 });
  const run2 = matching.recommendSpeakers(speakers, ratings, { limit: 5 });
  assert.deepEqual(run1, run2);
});
