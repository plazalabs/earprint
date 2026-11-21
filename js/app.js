(function () {
  'use strict';

  const STORAGE_KEY = 'earprint_v1';
  const PREDICTION_STORAGE_KEY = 'earprint_prediction_v1';
  const DATA_URL = './data/speakers.json';
  const COMPREHENSION_URL = './data/comprehension.json';
  const Matching = window.EarprintMatching;

  const state = {
    speakers: [],
    comprehensionMap: {},
    ratings: {},
    predictionRecords: [],
    predictionSession: null,
    activeSpeakerId: null,
    activeTab: 'discover',
  };

  const els = {
    loadError: document.getElementById('load-error'),
    headerProgress: document.getElementById('header-progress'),
    badgeMatching: document.getElementById('badge-matching'),
    badgeReport: document.getElementById('badge-report'),
    navButtons: Array.from(document.querySelectorAll('.nav-btn')),
    panels: {
      discover: document.getElementById('panel-discover'),
      earprint: document.getElementById('panel-earprint'),
      matching: document.getElementById('panel-matching'),
      explorer: document.getElementById('panel-explorer'),
      predict: document.getElementById('panel-predict'),
      report: document.getElementById('panel-report'),
    },
    speakerChannel: document.getElementById('speaker-channel'),
    speakerName: document.getElementById('speaker-name'),
    clipTitle: document.getElementById('clip-title'),
    speakerRatedStatus: document.getElementById('speaker-rated-status'),
    speakerTags: document.getElementById('speaker-tags'),
    youtubePlayer: document.getElementById('youtube-player'),
    clipStartNote: document.getElementById('clip-start-note'),
    clipOriginalLink: document.getElementById('clip-original-link'),
    testForm: document.getElementById('listening-test-form'),
    btnSaveRating: document.getElementById('btn-save-rating'),
    btnNextSpeaker: document.getElementById('btn-next-speaker'),
    formFeedback: document.getElementById('form-feedback'),
    speakerRoster: document.getElementById('speaker-roster'),
    epCount: document.getElementById('ep-count'),
    epScore: document.getElementById('ep-score'),
    epComp: document.getElementById('ep-comp'),
    epSummaryText: document.getElementById('ep-summary-text'),
    epAccentBars: document.getElementById('ep-accent-bars'),
    epPaceBars: document.getElementById('ep-pace-bars'),
    btnResetRatings: document.getElementById('btn-reset-ratings'),
    matchingStatusText: document.getElementById('matching-status-text'),
    recommendationsList: document.getElementById('recommendations-list'),
    explorerStatusText: document.getElementById('explorer-status-text'),
    explorerList: document.getElementById('explorer-list'),
    predictEmpty: document.getElementById('predict-empty'),
    predictActiveCard: document.getElementById('predict-active-card'),
    predictSessionProgress: document.getElementById('predict-session-progress'),
    predictBlindLabel: document.getElementById('predict-blind-label'),
    predictPreStatus: document.getElementById('predict-pre-status'),
    predictYoutubePlayer: document.getElementById('predict-youtube-player'),
    predictSegmentNote: document.getElementById('predict-segment-note'),
    predictQuizBadge: document.getElementById('predict-quiz-badge'),
    predictForm: document.getElementById('predict-form'),
    predictQuizSection: document.getElementById('predict-quiz-section'),
    predictFeedback: document.getElementById('predict-feedback'),
    predictRevealCard: document.getElementById('predict-reveal-card'),
    revealChannel: document.getElementById('reveal-channel'),
    revealName: document.getElementById('reveal-name'),
    revealClipTitle: document.getElementById('reveal-clip-title'),
    revealGroupBadge: document.getElementById('reveal-group-badge'),
    revealTags: document.getElementById('reveal-tags'),
    revealPredicted: document.getElementById('reveal-predicted'),
    revealActual: document.getElementById('reveal-actual'),
    revealError: document.getElementById('reveal-error'),
    revealBreakdown: document.getElementById('reveal-breakdown'),
    revealQuizBlock: document.getElementById('reveal-quiz-block'),
    revealSegmentInfo: document.getElementById('reveal-segment-info'),
    revealOriginalLink: document.getElementById('reveal-original-link'),
    btnNextPredict: document.getElementById('btn-next-predict'),
    repRecCount: document.getElementById('rep-rec-count'),
    repRndCount: document.getElementById('rep-rnd-count'),
    repRecActual: document.getElementById('rep-rec-actual'),
    repRndActual: document.getElementById('rep-rnd-actual'),
    repRecQuiz: document.getElementById('rep-rec-quiz'),
    repRndQuiz: document.getElementById('rep-rnd-quiz'),
    repRecComp: document.getElementById('rep-rec-comp'),
    repRndComp: document.getElementById('rep-rnd-comp'),
    repRecPred: document.getElementById('rep-rec-pred'),
    repRndPred: document.getElementById('rep-rnd-pred'),
    repRecMae: document.getElementById('rep-rec-mae'),
    repRndMae: document.getElementById('rep-rnd-mae'),
    reportTotalCount: document.getElementById('report-total-count'),
    reportHistoryList: document.getElementById('report-history-list'),
    btnResetPredictions: document.getElementById('btn-reset-predictions'),
  };

  function loadStoredRatings() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.ratings && typeof parsed.ratings === 'object') {
        return parsed.ratings;
      }
      return {};
    } catch (_err) {
      return {};
    }
  }

  function saveStoredRatings(ratings) {
    try {
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        ratings,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_err) {
      // Ignore storage quota or private-mode errors gracefully
    }
  }

  function loadStoredPredictions() {
    try {
      const raw = window.localStorage.getItem(PREDICTION_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
        return parsed.records;
      }
      return [];
    } catch (_err) {
      return [];
    }
  }

  function saveStoredPredictions(records) {
    try {
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        records,
      };
      window.localStorage.setItem(PREDICTION_STORAGE_KEY, JSON.stringify(payload));
    } catch (_err) {
      // Ignore storage quota or private-mode errors gracefully
    }
  }

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function setActiveTab(tabName) {
    if (!els.panels[tabName]) return;
    state.activeTab = tabName;
    els.navButtons.forEach((btn) => {
      const isTarget = btn.dataset.tab === tabName;
      btn.classList.toggle('is-active', isTarget);
      btn.setAttribute('aria-current', isTarget ? 'page' : 'false');
    });
    Object.keys(els.panels).forEach((key) => {
      els.panels[key].classList.toggle('is-active', key === tabName);
    });
    if (tabName === 'predict') {
      renderPredictPanel(true);
    } else if (tabName === 'report') {
      renderReport();
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function getActiveSpeaker() {
    return state.speakers.find((s) => s.id === state.activeSpeakerId) || state.speakers[0] || null;
  }

  function buildEmbedUrl(clip) {
    const start = Number.isInteger(clip.startSeconds) && clip.startSeconds >= 0 ? clip.startSeconds : 0;
    return `https://www.youtube.com/embed/${encodeURIComponent(clip.videoId)}?start=${start}&rel=0`;
  }

  function buildSegmentEmbedUrl(videoId, startSeconds, endSeconds) {
    const start = Number.isInteger(startSeconds) && startSeconds >= 0 ? startSeconds : 0;
    const end = Number.isInteger(endSeconds) && endSeconds > start ? endSeconds : start + 50;
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?start=${start}&end=${end}&rel=0`;
  }

  function buildWatchUrl(clip) {
    const start = Number.isInteger(clip.startSeconds) && clip.startSeconds >= 0 ? clip.startSeconds : 0;
    return `https://www.youtube.com/watch?v=${encodeURIComponent(clip.videoId)}&t=${start}s`;
  }

  function renderActiveSpeaker(reloadIframe) {
    const speaker = getActiveSpeaker();
    if (!speaker) return;

    const rating = state.ratings[speaker.id] || null;

    els.speakerChannel.textContent = `채널: ${speaker.channel}`;
    els.speakerName.textContent = speaker.name;
    els.clipTitle.textContent = speaker.clip.title;

    if (rating) {
      const clarityText = Matching.CLARITY_LABELS[rating.clarity] || rating.clarity;
      els.speakerRatedStatus.textContent = `평가됨 · ${clarityText} (${rating.comprehension}/5)`;
      els.speakerRatedStatus.classList.add('is-rated');
      els.btnSaveRating.textContent = '평가 수정';
    } else {
      els.speakerRatedStatus.textContent = '미평가';
      els.speakerRatedStatus.classList.remove('is-rated');
      els.btnSaveRating.textContent = '평가 저장';
    }

    els.speakerTags.innerHTML = '';
    els.speakerTags.appendChild(createEl('span', 'tag', `악센트: ${Matching.formatAccent(speaker.accent)}`));
    els.speakerTags.appendChild(createEl('span', 'tag tag-estimated', `속도: ${speaker.paceLabel}`));
    speaker.topics.forEach((topic) => {
      els.speakerTags.appendChild(createEl('span', 'tag', `#${Matching.formatTopic(topic)}`));
    });

    const targetEmbedSrc = buildEmbedUrl(speaker.clip);
    if (reloadIframe || els.youtubePlayer.getAttribute('src') !== targetEmbedSrc) {
      els.youtubePlayer.setAttribute('src', targetEmbedSrc);
      els.youtubePlayer.setAttribute('title', `${speaker.name} — ${speaker.clip.title}`);
    }

    els.clipStartNote.textContent = `시작 위치: ${speaker.clip.startSeconds}초 · 공식 임베드`;
    els.clipOriginalLink.setAttribute('href', buildWatchUrl(speaker.clip));

    // Sync Listening Test inputs
    const clarityInputs = els.testForm.querySelectorAll('input[name="clarity"]');
    clarityInputs.forEach((input) => {
      input.checked = Boolean(rating && rating.clarity === input.value);
    });
    const compInputs = els.testForm.querySelectorAll('input[name="comprehension"]');
    compInputs.forEach((input) => {
      input.checked = Boolean(rating && String(rating.comprehension) === input.value);
    });
  }

  function renderRoster() {
    els.speakerRoster.innerHTML = '';
    state.speakers.forEach((speaker, idx) => {
      const rating = state.ratings[speaker.id] || null;
      const btn = createEl('button', 'roster-item');
      btn.type = 'button';
      btn.setAttribute('role', 'listitem');
      btn.dataset.speakerId = speaker.id;
      if (speaker.id === state.activeSpeakerId) {
        btn.classList.add('is-selected');
      }

      const info = createEl('span', 'roster-info');
      info.appendChild(createEl('span', 'roster-name', `${idx + 1}. ${speaker.name}`));
      info.appendChild(
        createEl(
          'span',
          'roster-sub',
          `${speaker.channel} · ${Matching.formatAccent(speaker.accent)} · 속도 ${speaker.paceLabel}`
        )
      );

      let badgeClass = 'roster-badge';
      let badgeText = '미평가';
      if (rating) {
        badgeClass += ` is-${rating.clarity}`;
        badgeText = `${Matching.CLARITY_LABELS[rating.clarity]} ${rating.comprehension}/5`;
      }

      btn.appendChild(info);
      btn.appendChild(createEl('span', badgeClass, badgeText));

      btn.addEventListener('click', function () {
        selectSpeaker(speaker.id, true);
      });

      els.speakerRoster.appendChild(btn);
    });
  }

  function renderFeatureBars(container, items) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
      container.appendChild(
        createEl('div', 'empty-state', '평가 기록이 쌓이면 특성별 적합도가 여기에 표시됩니다.')
      );
      return;
    }

    items.forEach((item) => {
      const row = createEl('div', 'bar-row');
      const head = createEl('div', 'bar-row-head');
      head.appendChild(createEl('span', 'bar-row-label', item.label));
      head.appendChild(
        createEl(
          'span',
          'bar-row-stat',
          `적합도 ${item.avgScorePct}% · 이해도 ${item.avgComprehension}/5 (${item.count}명)`
        )
      );

      const track = createEl('div', 'bar-track');
      const fill = createEl('div', 'bar-fill');
      fill.style.width = `${Math.max(4, item.avgScorePct)}%`;
      track.appendChild(fill);

      row.appendChild(head);
      row.appendChild(track);
      container.appendChild(row);
    });
  }

  function renderEarprint(profile) {
    els.headerProgress.textContent = `평가 ${profile.evaluatedCount} / ${profile.totalCount}`;
    els.epCount.textContent = `${profile.evaluatedCount} / ${profile.totalCount}`;
    els.epScore.textContent = profile.evaluatedCount > 0 ? `${profile.avgScorePct}%` : '-';
    els.epComp.textContent = profile.evaluatedCount > 0 ? `${profile.avgComprehension} / 5` : '-';
    els.epSummaryText.textContent = profile.summaryText;

    renderFeatureBars(els.epAccentBars, profile.byAccent);
    renderFeatureBars(els.epPaceBars, profile.byPace);
  }

  function renderRecommendations(matchResult) {
    els.badgeMatching.textContent = String(matchResult.recommendations.length);
    els.matchingStatusText.textContent = matchResult.message;
    els.recommendationsList.innerHTML = '';

    if (matchResult.recommendations.length === 0) {
      const empty = createEl('div', 'empty-state');
      empty.appendChild(createEl('p', '', matchResult.message));
      const goBtn = createEl('button', 'btn btn-secondary btn-sm', '발견·평가로 이동');
      goBtn.type = 'button';
      goBtn.addEventListener('click', function () {
        setActiveTab('discover');
      });
      empty.appendChild(goBtn);
      els.recommendationsList.appendChild(empty);
      return;
    }

    matchResult.recommendations.forEach((rec, index) => {
      const speaker = rec.speaker;
      const card = createEl('article', 'rec-card');

      const head = createEl('div', 'rec-head');
      const titleBox = createEl('div');
      titleBox.appendChild(createEl('p', 'speaker-channel', `추천 #${index + 1} · 채널: ${speaker.channel}`));
      titleBox.appendChild(createEl('h3', 'speaker-name', speaker.name));
      titleBox.appendChild(createEl('p', 'clip-title', speaker.clip.title));
      head.appendChild(titleBox);
      head.appendChild(createEl('span', 'rec-score', `유사도 ${rec.matchScorePct}%`));
      card.appendChild(head);

      const tags = createEl('div', 'tag-row');
      tags.appendChild(createEl('span', 'tag', `악센트: ${Matching.formatAccent(speaker.accent)}`));
      tags.appendChild(createEl('span', 'tag tag-estimated', `속도: ${speaker.paceLabel}`));
      speaker.topics.forEach((t) => {
        tags.appendChild(createEl('span', 'tag', `#${Matching.formatTopic(t)}`));
      });
      card.appendChild(tags);

      card.appendChild(createEl('p', 'rec-reason', rec.reason));

      const actions = createEl('div', 'rec-actions');
      const listenBtn = createEl('button', 'btn btn-primary btn-sm', '이 화자 클립 듣기');
      listenBtn.type = 'button';
      listenBtn.addEventListener('click', function () {
        selectSpeaker(speaker.id);
        setActiveTab('discover');
      });

      const exploreBtn = createEl('button', 'btn btn-secondary btn-sm', '다른 콘텐츠 링크 보기');
      exploreBtn.type = 'button';
      exploreBtn.addEventListener('click', function () {
        setActiveTab('explorer');
      });

      actions.appendChild(listenBtn);
      actions.appendChild(exploreBtn);
      card.appendChild(actions);

      els.recommendationsList.appendChild(card);
    });
  }

  function renderExplorer(matchResult) {
    els.explorerList.innerHTML = '';

    let targetSpeakers = matchResult.recommendations.map((r) => ({
      speaker: r.speaker,
      subtitle: r.reason,
      badge: `추천 유사도 ${r.matchScorePct}%`,
    }));

    if (targetSpeakers.length === 0 && matchResult.status === 'all_rated') {
      const topRated = state.speakers
        .map((s) => ({ speaker: s, score: Matching.scoreEvaluation(state.ratings[s.id]) || 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      els.explorerStatusText.textContent =
        '모든 화자를 평가 완료하여, 가장 높게 평가한 화자 상위 3명의 다른 콘텐츠를 표시합니다.';
      targetSpeakers = topRated.map((item) => ({
        speaker: item.speaker,
        subtitle: `나의 평가 적합도 ${Math.round(item.score * 100)}% 화자입니다.`,
        badge: `적합도 ${Math.round(item.score * 100)}%`,
      }));
    } else if (targetSpeakers.length === 0) {
      els.explorerStatusText.textContent =
        '화자를 1명 이상 평가하면 추천된 화자의 다른 YouTube 콘텐츠 목록이 열립니다.';
      const empty = createEl('div', 'empty-state');
      empty.appendChild(
        createEl('p', '', '아직 추천 화자가 없습니다. 먼저 클립을 듣고 평가해 주세요.')
      );
      const goBtn = createEl('button', 'btn btn-primary btn-sm', '화자 평가하러 가기');
      goBtn.type = 'button';
      goBtn.addEventListener('click', function () {
        setActiveTab('discover');
      });
      empty.appendChild(goBtn);
      els.explorerList.appendChild(empty);
      return;
    } else {
      els.explorerStatusText.textContent =
        '맞춤 추천된 화자의 다른 공개 강연·인터뷰 YouTube 링크입니다.';
    }

    targetSpeakers.forEach((entry) => {
      const speaker = entry.speaker;
      const card = createEl('article', 'rec-card');

      const head = createEl('div', 'rec-head');
      const info = createEl('div');
      info.appendChild(createEl('h3', 'speaker-name', speaker.name));
      info.appendChild(
        createEl(
          'p',
          'speaker-channel',
          `${Matching.formatAccent(speaker.accent)} · 속도 ${speaker.paceLabel}`
        )
      );
      head.appendChild(info);
      head.appendChild(createEl('span', 'rec-score', entry.badge));
      card.appendChild(head);

      card.appendChild(createEl('p', 'section-desc', entry.subtitle));

      const ul = createEl('ul', 'explorer-links');
      speaker.moreContent.forEach((item) => {
        const li = createEl('li', 'explorer-link-item');
        const link = createEl('a');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        const textWrap = createEl('span');
        textWrap.appendChild(createEl('span', 'explorer-link-title', item.title));
        textWrap.appendChild(createEl('span', 'explorer-link-channel', `YouTube · 채널: ${item.channel}`));

        link.appendChild(textWrap);
        link.appendChild(createEl('span', 'explorer-arrow', '열기 ↗'));
        li.appendChild(link);
        ul.appendChild(li);
      });

      card.appendChild(ul);
      els.explorerList.appendChild(card);
    });
  }

  function getTestedSpeakerIds() {
    const ids = new Set();
    for (const rec of state.predictionRecords) {
      if (rec && typeof rec.speakerId === 'string') {
        ids.add(rec.speakerId);
      }
    }
    return ids;
  }

  function getNextStartGroup() {
    return state.predictionRecords.length % 2 === 0 ? 'recommended' : 'random';
  }

  function ensurePredictionSession(forceRebuild) {
    const profile = Matching.computeEarprintProfile(state.speakers, state.ratings);
    if (profile.evaluatedCount === 0) {
      state.predictionSession = null;
      return null;
    }

    if (
      !forceRebuild &&
      state.predictionSession &&
      state.predictionSession.status === 'ready'
    ) {
      return state.predictionSession;
    }

    const built = Matching.buildPredictionSession(state.speakers, state.ratings, {
      excludeIds: getTestedSpeakerIds(),
      startGroup: getNextStartGroup(),
      comprehensionMap: state.comprehensionMap,
    });

    state.predictionSession = {
      status: built.status,
      message: built.message,
      queue: built.queue.map((item) => ({
        ...item,
        predictedAt: null,
      })),
      currentIndex: 0,
      lastReveal: null,
    };
    return state.predictionSession;
  }

  function clearRevealCard() {
    els.revealChannel.textContent = '';
    els.revealName.textContent = '';
    els.revealClipTitle.textContent = '';
    els.revealGroupBadge.textContent = '';
    els.revealTags.innerHTML = '';
    els.revealPredicted.textContent = '-';
    els.revealActual.textContent = '-';
    els.revealError.textContent = '-';
    els.revealBreakdown.innerHTML = '';
    els.revealQuizBlock.innerHTML = '';
    els.revealQuizBlock.classList.add('is-hidden');
  }

  function renderPredictEmpty(message, actionLabel, onAction) {
    els.predictActiveCard.classList.add('is-hidden');
    els.predictRevealCard.classList.add('is-hidden');
    clearRevealCard();
    els.predictYoutubePlayer.setAttribute('src', '');
    els.predictEmpty.innerHTML = '';
    els.predictEmpty.classList.remove('is-hidden');
    els.predictEmpty.appendChild(createEl('p', '', message));
    if (actionLabel && typeof onAction === 'function') {
      const btn = createEl('button', 'btn btn-primary btn-sm', actionLabel);
      btn.type = 'button';
      btn.addEventListener('click', onAction);
      els.predictEmpty.appendChild(btn);
    }
  }

  function renderPredictQuiz(compItem) {
    els.predictQuizSection.innerHTML = '';

    if (!compItem || compItem.quizAvailable !== true) {
      els.predictQuizBadge.textContent = '객관식 문항 미제공 (주관 평가 전용)';
      const note = createEl(
        'div',
        'quiz-unavailable-note',
        '이 클립은 지정 구간 트랜스크립트 미확인(quizAvailable: false)으로 객관식 문제가 제공되지 않습니다. 주관 청취 평가만으로 예측 오차를 기록합니다.'
      );
      els.predictQuizSection.appendChild(note);
      return;
    }

    els.predictQuizBadge.textContent = `객관식 이해도 문항 ${compItem.questions.length}개`;
    compItem.questions.forEach((question, qIdx) => {
      const box = createEl('div', 'quiz-question');
      box.appendChild(createEl('p', 'quiz-prompt', `Q${qIdx + 1}. ${question.prompt}`));

      const choicesWrap = createEl('div', 'quiz-choices');
      choicesWrap.setAttribute('role', 'radiogroup');
      choicesWrap.setAttribute('aria-label', `객관식 문제 ${qIdx + 1}`);

      question.choices.forEach((choiceText, cIdx) => {
        const label = createEl('label', 'quiz-choice');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `predict_q_${qIdx}`;
        input.value = String(cIdx);
        label.appendChild(input);
        label.appendChild(createEl('span', '', choiceText));
        choicesWrap.appendChild(label);
      });

      box.appendChild(choicesWrap);
      els.predictQuizSection.appendChild(box);
    });
  }

  function renderPredictReveal(revealData) {
    const { speaker, compItem, record, quizResult } = revealData;
    const groupText = record.group === 'recommended' ? '추천' : '무작위';

    els.predictEmpty.classList.add('is-hidden');
    els.predictActiveCard.classList.add('is-hidden');
    els.predictYoutubePlayer.setAttribute('src', '');
    els.predictRevealCard.classList.remove('is-hidden');

    els.revealChannel.textContent = `채널: ${speaker.channel}`;
    els.revealName.textContent = speaker.name;
    els.revealClipTitle.textContent = speaker.clip.title;
    els.revealGroupBadge.textContent = `배정 집단: ${groupText}`;

    els.revealTags.innerHTML = '';
    els.revealTags.appendChild(
      createEl('span', 'tag', `악센트: ${Matching.formatAccent(speaker.accent)}`)
    );
    els.revealTags.appendChild(
      createEl('span', 'tag tag-estimated', `속도: ${speaker.paceLabel}`)
    );
    speaker.topics.forEach((topic) => {
      els.revealTags.appendChild(createEl('span', 'tag', `#${Matching.formatTopic(topic)}`));
    });

    const err = Matching.computePredictionError(record.predictedScore, record.actualScore);
    els.revealPredicted.textContent = err ? `${err.predictedScorePct}%` : '-';
    els.revealActual.textContent = err ? `${err.actualScorePct}%` : '-';
    els.revealError.textContent = err ? `${err.absErrorPct}%p` : '-';

    els.revealBreakdown.innerHTML = '';
    const quizRow = createEl('div', 'breakdown-row');
    quizRow.appendChild(createEl('span', '', '객관식 정답률'));
    quizRow.appendChild(
      createEl(
        'strong',
        '',
        quizResult
          ? `${quizResult.correctCount} / ${quizResult.totalQuestions} (${quizResult.accuracyPct}%)`
          : '미제공 (quizAvailable: false)'
      )
    );
    els.revealBreakdown.appendChild(quizRow);

    const subjRow = createEl('div', 'breakdown-row');
    subjRow.appendChild(createEl('span', '', '주관 평가'));
    const clarityLabel = Matching.CLARITY_LABELS[record.rating.clarity] || record.rating.clarity;
    subjRow.appendChild(
      createEl(
        'strong',
        '',
        `${clarityLabel} · 이해도 ${record.rating.comprehension}/5 (${Math.round(record.subjectiveScore * 100)}%)`
      )
    );
    els.revealBreakdown.appendChild(subjRow);

    const signedRow = createEl('div', 'breakdown-row');
    signedRow.appendChild(createEl('span', '', '부호 오차 (예측 − 실제)'));
    const signedPrefix = err && err.signedErrorPct > 0 ? '+' : '';
    signedRow.appendChild(
      createEl('strong', '', err ? `${signedPrefix}${err.signedErrorPct}%p` : '-')
    );
    els.revealBreakdown.appendChild(signedRow);

    const modeRow = createEl('div', 'breakdown-row');
    modeRow.appendChild(createEl('span', '', '실제 종합 점수 산출'));
    modeRow.appendChild(
      createEl(
        'strong',
        '',
        record.actualMode === 'combined'
          ? '객관식 50% + 주관 평가 50%'
          : '주관 평가 100% (문항 미제공)'
      )
    );
    els.revealBreakdown.appendChild(modeRow);

    els.revealQuizBlock.innerHTML = '';
    if (compItem && compItem.quizAvailable && quizResult) {
      els.revealQuizBlock.classList.remove('is-hidden');
      els.revealQuizBlock.appendChild(createEl('h4', 'subcard-title', '객관식 채점 및 근거 발췌'));

      compItem.questions.forEach((question, qIdx) => {
        const isCorrect = quizResult.itemResults[qIdx];
        const selectedIdx = record.quizSelectedIndices[qIdx];
        const itemEl = createEl('div', `reveal-q-item ${isCorrect ? 'is-correct' : 'is-wrong'}`);
        itemEl.appendChild(
          createEl(
            'div',
            'reveal-q-head',
            `Q${qIdx + 1}. ${isCorrect ? '정답' : '오답'} — ${question.prompt}`
          )
        );
        itemEl.appendChild(
          createEl('div', '', `내 선택: ${question.choices[selectedIdx]}`)
        );
        if (!isCorrect) {
          itemEl.appendChild(
            createEl('div', '', `정답: ${question.choices[question.answerIndex]}`)
          );
        }
        els.revealQuizBlock.appendChild(itemEl);
      });

      const excerptBox = createEl('div', 'excerpt-box');
      excerptBox.appendChild(
        createEl(
          'p',
          '',
          `근거 발췌 (${compItem.verifiedTimestampRange || `${compItem.startSeconds}~${compItem.endSeconds}초`}): ${compItem.sourceExcerpt}`
        )
      );
      const sourceP = createEl('p', '');
      sourceP.appendChild(createEl('span', '', `출처: ${compItem.sourceName || '확인된 트랜스크립트'} · `));
      const srcLink = createEl('a', 'text-link', '출처 페이지 열기 ↗');
      srcLink.href = compItem.sourceUrl;
      srcLink.target = '_blank';
      srcLink.rel = 'noopener noreferrer';
      sourceP.appendChild(srcLink);
      excerptBox.appendChild(sourceP);
      els.revealQuizBlock.appendChild(excerptBox);
    } else {
      els.revealQuizBlock.classList.add('is-hidden');
    }

    const startSec = compItem ? compItem.startSeconds : speaker.clip.startSeconds;
    const endSec = compItem ? compItem.endSeconds : speaker.clip.startSeconds + 50;
    els.revealSegmentInfo.textContent = `지정 구간: ${startSec}초 ~ ${endSec}초 (${endSec - startSec}초)`;
    els.revealOriginalLink.setAttribute('href', buildWatchUrl(speaker.clip));

    const hasNext =
      state.predictionSession &&
      state.predictionSession.currentIndex + 1 < state.predictionSession.queue.length;
    els.btnNextPredict.textContent = hasNext ? '다음 Blind 화자 →' : '세션 완료 확인 →';
  }

  function renderPredictPanel(allowIframeLoad) {
    const profile = Matching.computeEarprintProfile(state.speakers, state.ratings);
    if (profile.evaluatedCount === 0) {
      renderPredictEmpty(
        'Blind 예측 테스트를 시작하려면 먼저 발견·평가 탭에서 1명 이상의 화자를 평가해 Earprint를 생성해 주세요.',
        '발견·평가로 이동',
        function () {
          setActiveTab('discover');
        }
      );
      return;
    }

    const session = ensurePredictionSession(false);
    if (!session || session.status !== 'ready') {
      renderPredictEmpty(
        '예측 테스트할 미평가·미테스트 화자가 남아 있지 않습니다. 검증 리포트에서 누적 수치를 확인하거나 예측 기록을 초기화할 수 있습니다.',
        '검증 리포트 보기',
        function () {
          setActiveTab('report');
        }
      );
      return;
    }

    if (session.lastReveal) {
      renderPredictReveal(session.lastReveal);
      return;
    }

    if (session.currentIndex >= session.queue.length) {
      renderPredictEmpty(
        '현재 Blind 예측 세션을 모두 완료했습니다. 검증 리포트에서 추천 vs 무작위 수치를 확인해 보세요.',
        '검증 리포트 보기',
        function () {
          setActiveTab('report');
        }
      );
      return;
    }

    const currentItem = session.queue[session.currentIndex];
    const speaker = currentItem.speaker;
    const compItem = state.comprehensionMap[speaker.id] || null;
    const startSec = compItem ? compItem.startSeconds : speaker.clip.startSeconds;
    const endSec = compItem ? compItem.endSeconds : speaker.clip.startSeconds + 50;
    const durationSec = endSec - startSec;

    // Freeze pre-listening prediction timestamp BEFORE playback and submission
    if (!currentItem.predictedAt) {
      currentItem.predictedAt = new Date().toISOString();
    }

    els.predictEmpty.classList.add('is-hidden');
    els.predictRevealCard.classList.add('is-hidden');
    clearRevealCard();
    els.predictActiveCard.classList.remove('is-hidden');

    const seqNum = session.currentIndex + 1;
    els.predictSessionProgress.textContent = `Blind 세션 ${seqNum} / ${session.queue.length}`;
    els.predictBlindLabel.textContent = `Blind 화자 #${seqNum}`;
    els.predictPreStatus.textContent = '사전 예측 기록 완료';
    els.predictSegmentNote.textContent = `지정 구간: ${startSec}초 ~ ${endSec}초 (${durationSec}초)`;

    if (allowIframeLoad || state.activeTab === 'predict') {
      const targetSrc = buildSegmentEmbedUrl(speaker.clip.videoId, startSec, endSec);
      if (els.predictYoutubePlayer.getAttribute('src') !== targetSrc) {
        els.predictYoutubePlayer.setAttribute('src', targetSrc);
        els.predictYoutubePlayer.setAttribute('title', `Blind 청취 테스트 클립 #${seqNum}`);
      }
    }

    // Reset form inputs cleanly
    els.predictForm.reset();
    els.predictFeedback.textContent = '';
    els.predictFeedback.classList.remove('is-error');
    renderPredictQuiz(compItem);
  }

  function handlePredictSubmit(event) {
    event.preventDefault();
    const session = state.predictionSession;
    if (!session || session.status !== 'ready' || session.currentIndex >= session.queue.length) {
      return;
    }

    const currentItem = session.queue[session.currentIndex];
    const speaker = currentItem.speaker;
    const compItem = state.comprehensionMap[speaker.id] || null;

    const clarityEl = els.predictForm.querySelector('input[name="predict_clarity"]:checked');
    const compEl = els.predictForm.querySelector('input[name="predict_comprehension"]:checked');

    if (!clarityEl || !compEl) {
      els.predictFeedback.textContent = '주관 청취 명확도와 이해도(1~5)를 모두 선택해 주세요.';
      els.predictFeedback.classList.add('is-error');
      return;
    }

    let quizResult = null;
    let selectedIndices = [];
    if (compItem && compItem.quizAvailable) {
      for (let qIdx = 0; qIdx < compItem.questions.length; qIdx += 1) {
        const checked = els.predictForm.querySelector(`input[name="predict_q_${qIdx}"]:checked`);
        if (!checked) {
          els.predictFeedback.textContent = `객관식 문제 Q${qIdx + 1}의 답안을 선택해 주세요.`;
          els.predictFeedback.classList.add('is-error');
          return;
        }
        selectedIndices.push(Number(checked.value));
      }
      quizResult = Matching.gradeQuiz(compItem.questions, selectedIndices);
      if (!quizResult) {
        els.predictFeedback.textContent = '객관식 답안 채점에 실패했습니다. 다시 선택해 주세요.';
        els.predictFeedback.classList.add('is-error');
        return;
      }
    }

    const rating = {
      clarity: clarityEl.value,
      comprehension: Number(compEl.value),
    };
    const actual = Matching.computeActualScore(rating, quizResult);
    const err = actual
      ? Matching.computePredictionError(currentItem.predictedScore, actual.actualScore)
      : null;

    if (!actual || !err) {
      els.predictFeedback.textContent = '예측 오차 계산 중 유효하지 않은 값이 감지되었습니다.';
      els.predictFeedback.classList.add('is-error');
      return;
    }

    const nowIso = new Date().toISOString();
    const record = {
      id: `pred_${Date.now()}_${speaker.id}`,
      speakerId: speaker.id,
      group: currentItem.group,
      predictedScore: err.predictedScore,
      predictedAt: currentItem.predictedAt || nowIso,
      submittedAt: nowIso,
      rating,
      subjectiveScore: actual.subjectiveScore,
      quizAvailable: Boolean(compItem && compItem.quizAvailable),
      quizSelectedIndices: selectedIndices,
      quizCorrectCount: quizResult ? quizResult.correctCount : null,
      quizTotalQuestions: quizResult ? quizResult.totalQuestions : 0,
      quizAccuracy: actual.quizAccuracy,
      actualScore: err.actualScore,
      actualMode: actual.mode,
      signedError: err.signedError,
      absError: err.absError,
    };

    state.predictionRecords.push(record);
    saveStoredPredictions(state.predictionRecords);

    session.lastReveal = {
      speaker,
      compItem,
      record,
      quizResult,
    };

    els.predictFeedback.textContent = '';
    els.predictFeedback.classList.remove('is-error');

    renderPredictReveal(session.lastReveal);
    renderReport();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function handleNextPredict() {
    const session = state.predictionSession;
    if (!session) return;
    session.lastReveal = null;
    session.currentIndex += 1;
    renderPredictPanel(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function formatMetricPct(val) {
    return val === null || val === undefined ? '-' : `${val}%`;
  }

  function formatMetricPctPoints(val) {
    return val === null || val === undefined ? '-' : `${val}%p`;
  }

  function renderReport() {
    const report = Matching.summarizePredictionReport(state.predictionRecords);
    const rec = report.recommended;
    const rnd = report.random;

    els.badgeReport.textContent = String(report.totalCount);
    els.reportTotalCount.textContent = String(report.totalCount);

    els.repRecCount.textContent = String(rec.count);
    els.repRndCount.textContent = String(rnd.count);

    els.repRecActual.textContent = formatMetricPct(rec.avgActualScorePct);
    els.repRndActual.textContent = formatMetricPct(rnd.avgActualScorePct);

    els.repRecQuiz.textContent =
      rec.quizSampleCount > 0
        ? `${rec.avgQuizAccuracyPct}% (N=${rec.quizSampleCount})`
        : '-';
    els.repRndQuiz.textContent =
      rnd.quizSampleCount > 0
        ? `${rnd.avgQuizAccuracyPct}% (N=${rnd.quizSampleCount})`
        : '-';

    els.repRecComp.textContent =
      rec.avgSubjectiveComprehension !== null ? String(rec.avgSubjectiveComprehension) : '-';
    els.repRndComp.textContent =
      rnd.avgSubjectiveComprehension !== null ? String(rnd.avgSubjectiveComprehension) : '-';

    els.repRecPred.textContent = formatMetricPct(rec.avgPredictedScorePct);
    els.repRndPred.textContent = formatMetricPct(rnd.avgPredictedScorePct);

    els.repRecMae.textContent = formatMetricPctPoints(rec.avgAbsErrorPct);
    els.repRndMae.textContent = formatMetricPctPoints(rnd.avgAbsErrorPct);

    els.reportHistoryList.innerHTML = '';
    if (state.predictionRecords.length === 0) {
      els.reportHistoryList.appendChild(
        createEl('div', 'empty-state', '아직 저장된 Blind 예측 기록이 없습니다.')
      );
      return;
    }

    const speakerById = new Map(state.speakers.map((s) => [s.id, s]));
    const reversed = state.predictionRecords.slice().reverse();

    reversed.forEach((item) => {
      const speaker = speakerById.get(item.speakerId);
      const err = Matching.computePredictionError(item.predictedScore, item.actualScore);
      const groupLabel = item.group === 'recommended' ? '추천' : '무작위';

      const card = createEl('div', 'history-item');
      const head = createEl('div', 'history-item-head');
      head.appendChild(
        createEl('span', 'history-speaker', speaker ? speaker.name : item.speakerId)
      );
      head.appendChild(
        createEl(
          'span',
          `group-pill ${item.group === 'recommended' ? 'is-recommended' : ''}`,
          groupLabel
        )
      );
      card.appendChild(head);

      const quizText =
        item.quizAvailable && item.quizAccuracy !== null
          ? `객관식 ${Math.round(item.quizAccuracy * 100)}%`
          : '객관식 미제공';
      const subjText = item.rating
        ? `주관 ${Matching.CLARITY_LABELS[item.rating.clarity] || item.rating.clarity} ${item.rating.comprehension}/5`
        : '주관 -';
      const metricText = err
        ? `예측 ${err.predictedScorePct}% · 실제 ${err.actualScorePct}% (${quizText}, ${subjText}) · 오차 ${err.absErrorPct}%p`
        : '-';
      card.appendChild(createEl('div', 'history-metrics', metricText));

      els.reportHistoryList.appendChild(card);
    });
  }

  function handleResetPredictions() {
    state.predictionRecords = [];
    state.predictionSession = null;
    try {
      window.localStorage.removeItem(PREDICTION_STORAGE_KEY);
    } catch (_err) {
      // Ignore storage errors
    }
    renderReport();
    if (state.activeTab === 'predict') {
      renderPredictPanel(true);
    }
  }

  function renderAll(reloadIframe) {
    renderActiveSpeaker(Boolean(reloadIframe));
    renderRoster();
    const profile = Matching.computeEarprintProfile(state.speakers, state.ratings);
    const matchResult = Matching.recommendSpeakers(state.speakers, state.ratings, { limit: 3 });
    renderEarprint(profile);
    renderRecommendations(matchResult);
    renderExplorer(matchResult);
    renderReport();
    if (state.activeTab === 'predict') {
      renderPredictPanel(false);
    }
  }

  function selectSpeaker(speakerId, scrollToTop) {
    const changed = state.activeSpeakerId !== speakerId;
    state.activeSpeakerId = speakerId;
    els.formFeedback.textContent = '';
    els.formFeedback.classList.remove('is-error');
    renderActiveSpeaker(changed);
    renderRoster();
    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function moveToNextSpeaker() {
    if (state.speakers.length === 0) return;
    const currentIdx = state.speakers.findIndex((s) => s.id === state.activeSpeakerId);
    // Prefer the next unrated speaker; if all are rated, advance sequentially.
    for (let offset = 1; offset <= state.speakers.length; offset += 1) {
      const candidate = state.speakers[(currentIdx + offset) % state.speakers.length];
      if (!state.ratings[candidate.id]) {
        selectSpeaker(candidate.id);
        return;
      }
    }
    const nextSpeaker = state.speakers[(currentIdx + 1) % state.speakers.length];
    selectSpeaker(nextSpeaker.id);
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    const speaker = getActiveSpeaker();
    if (!speaker) return;

    const clarityEl = els.testForm.querySelector('input[name="clarity"]:checked');
    const compEl = els.testForm.querySelector('input[name="comprehension"]:checked');

    if (!clarityEl || !compEl) {
      els.formFeedback.textContent = '청취 명확도와 이해도(1~5)를 모두 선택해 주세요.';
      els.formFeedback.classList.add('is-error');
      return;
    }

    const clarity = clarityEl.value;
    const comprehension = Number(compEl.value);
    const score = Matching.scoreEvaluation({ clarity, comprehension });
    if (score === null) {
      els.formFeedback.textContent = '유효하지 않은 평가 값입니다.';
      els.formFeedback.classList.add('is-error');
      return;
    }

    state.ratings[speaker.id] = {
      clarity,
      comprehension,
      updatedAt: new Date().toISOString(),
    };
    saveStoredRatings(state.ratings);
    // Refresh pending Blind session queue on next visit so predictions reflect updated Earprint
    state.predictionSession = null;

    els.formFeedback.classList.remove('is-error');
    els.formFeedback.textContent = `${speaker.name} 평가가 저장되었습니다 (${Matching.CLARITY_LABELS[clarity]}, 이해도 ${comprehension}/5).`;
    renderAll(false);
  }

  function handleResetRatings() {
    state.ratings = {};
    state.predictionSession = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_err) {
      // Ignore storage errors
    }
    els.formFeedback.textContent = '평가 기록이 초기화되었습니다.';
    els.formFeedback.classList.remove('is-error');
    renderAll(false);
  }

  function bindEvents() {
    els.navButtons.forEach((btn) => {
      btn.addEventListener('click', function () {
        setActiveTab(btn.dataset.tab);
      });
    });

    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', function () {
        setActiveTab(btn.dataset.goto);
      });
    });

    els.testForm.addEventListener('submit', handleFormSubmit);
    els.btnNextSpeaker.addEventListener('click', moveToNextSpeaker);
    els.btnResetRatings.addEventListener('click', handleResetRatings);

    els.predictForm.addEventListener('submit', handlePredictSubmit);
    els.btnNextPredict.addEventListener('click', handleNextPredict);
    els.btnResetPredictions.addEventListener('click', handleResetPredictions);
  }

  async function init() {
    bindEvents();
    state.ratings = loadStoredRatings();
    state.predictionRecords = loadStoredPredictions();

    try {
      const [speakersRes, compRes] = await Promise.all([
        fetch(DATA_URL, { cache: 'no-cache' }),
        fetch(COMPREHENSION_URL, { cache: 'no-cache' }),
      ]);
      if (!speakersRes.ok) {
        throw new Error(`speakers.json HTTP ${speakersRes.status}`);
      }
      if (!compRes.ok) {
        throw new Error(`comprehension.json HTTP ${compRes.status}`);
      }

      const [data, compData] = await Promise.all([speakersRes.json(), compRes.json()]);
      const validation = Matching.validateSpeakersData(data);
      if (!validation.valid) {
        throw new Error(`화자 데이터 검증 실패: ${validation.errors[0]}`);
      }
      const compValidation = Matching.validateComprehensionData(compData, data);
      if (!compValidation.valid) {
        throw new Error(`이해도 문항 데이터 검증 실패: ${compValidation.errors[0]}`);
      }

      state.speakers = data.speakers;
      state.comprehensionMap = {};
      compData.items.forEach((item) => {
        state.comprehensionMap[item.speakerId] = item;
      });
      state.activeSpeakerId = state.speakers[0] ? state.speakers[0].id : null;
      renderAll(true);
    } catch (err) {
      els.loadError.textContent =
        `화자 데이터를 불러오지 못했습니다(${err.message}). 정적 웹 서버(예: GitHub Pages 또는 로컬 HTTP 서버)에서 열어 주세요.`;
      els.loadError.classList.remove('is-hidden');
    }
  }

  init();
})();
