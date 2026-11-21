(function () {
  'use strict';

  const STORAGE_KEY = 'earprint_v1';
  const DATA_URL = './data/speakers.json';
  const Matching = window.EarprintMatching;

  const state = {
    speakers: [],
    ratings: {},
    activeSpeakerId: null,
    activeTab: 'discover',
  };

  const els = {
    loadError: document.getElementById('load-error'),
    headerProgress: document.getElementById('header-progress'),
    badgeMatching: document.getElementById('badge-matching'),
    navButtons: Array.from(document.querySelectorAll('.nav-btn')),
    panels: {
      discover: document.getElementById('panel-discover'),
      earprint: document.getElementById('panel-earprint'),
      matching: document.getElementById('panel-matching'),
      explorer: document.getElementById('panel-explorer'),
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
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function getActiveSpeaker() {
    return state.speakers.find((s) => s.id === state.activeSpeakerId) || state.speakers[0] || null;
  }

  function buildEmbedUrl(clip) {
    const start = Number.isInteger(clip.startSeconds) && clip.startSeconds >= 0 ? clip.startSeconds : 0;
    return `https://www.youtube.com/embed/${encodeURIComponent(clip.videoId)}?start=${start}&rel=0`;
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
        selectSpeaker(speaker.id);
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

  function renderAll(reloadIframe) {
    renderActiveSpeaker(Boolean(reloadIframe));
    renderRoster();
    const profile = Matching.computeEarprintProfile(state.speakers, state.ratings);
    const matchResult = Matching.recommendSpeakers(state.speakers, state.ratings, { limit: 3 });
    renderEarprint(profile);
    renderRecommendations(matchResult);
    renderExplorer(matchResult);
  }

  function selectSpeaker(speakerId) {
    const changed = state.activeSpeakerId !== speakerId;
    state.activeSpeakerId = speakerId;
    els.formFeedback.textContent = '';
    els.formFeedback.classList.remove('is-error');
    renderActiveSpeaker(changed);
    renderRoster();
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

    els.formFeedback.classList.remove('is-error');
    els.formFeedback.textContent = `${speaker.name} 평가가 저장되었습니다 (${Matching.CLARITY_LABELS[clarity]}, 이해도 ${comprehension}/5).`;
    renderAll(false);
  }

  function handleResetRatings() {
    state.ratings = {};
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
  }

  async function init() {
    bindEvents();
    state.ratings = loadStoredRatings();

    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const validation = Matching.validateSpeakersData(data);
      if (!validation.valid) {
        throw new Error(`데이터 검증 실패: ${validation.errors[0]}`);
      }

      state.speakers = data.speakers;
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
