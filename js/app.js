// Quiz Prep App - استعداد التفتيش
(function() {
  'use strict';

  // --- Config ---
  const STORAGE_KEY = 'quiz-progress';
  const TYPO_KEY = 'quiz-typos';
  const TOTAL_QUESTIONS = 1022;

  // --- Data ---
  let allQuestions = [];

  // --- State ---
  let progress = loadProgress();
  let currentQuestion = null;
  let currentQueue = [];
  let queueIndex = 0;
  let quizMode = 'sequential'; // sequential, weak
  let currentStreak = 0;
  let answered = false;
  let flaggedTypos = loadTypos();
  let typoJustFlagged = false;

  // --- Init ---
  async function init() {
    try {
      const res = await fetch('js/questions.json');
      allQuestions = await res.json();
    } catch(e) {
      document.getElementById('question-text').textContent = 'خطأ في تحميل الأسئلة';
      return;
    }

    updateHeader();
    buildQueue();
    bindEvents();

    // Show first question immediately
    showNextQuestion();
  }

  // --- Progress ---
  function loadProgress() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    } catch(e) {}
    return { seen: {}, streak: 0, bestStreak: 0, nextQ: 1 };
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }

  // --- Typos ---
  function loadTypos() {
    try {
      const data = localStorage.getItem(TYPO_KEY);
      return data ? JSON.parse(data) : [];
    } catch(e) { return []; }
  }

  function saveTypos() {
    localStorage.setItem(TYPO_KEY, JSON.stringify(flaggedTypos));
  }

  function flagTypo(num) {
    if (!flaggedTypos.includes(num)) {
      flaggedTypos.push(num);
      saveTypos();
    }
  }

  function unflagTypo(num) {
    flaggedTypos = flaggedTypos.filter(n => n !== num);
    saveTypos();
  }

  function exportTypos() {
    const text = flaggedTypos.sort((a,b) => a-b).join(', ');
    navigator.clipboard.writeText(text).then(() => {
      alert('تم نسخ أرقام الأسئلة: ' + text);
    }).catch(() => {
      prompt('نسخ أرقام الأسئلة:', text);
    });
  }

  function recordAnswer(num, correct) {
    const existing = progress.seen[num];
    if (existing) {
      existing.attempts = (existing.attempts || 0) + 1;
      existing.correct = (existing.correct || 0) + (correct ? 1 : 0);
      existing.lastSeen = Date.now();
    } else {
      progress.seen[num] = {
        attempts: 1,
        correct: correct ? 1 : 0,
        lastSeen: Date.now()
      };
    }

    // Update streak
    if (correct) {
      currentStreak++;
      if (currentStreak > progress.bestStreak) {
        progress.bestStreak = currentStreak;
      }
    } else {
      currentStreak = 0;
    }
    progress.streak = currentStreak;

    // Advance nextQ pointer
    if (quizMode === 'sequential' && num === progress.nextQ) {
      // Find next unseen sequential question
      for (let i = progress.nextQ + 1; i <= TOTAL_QUESTIONS; i++) {
        if (!progress.seen[i]) {
          progress.nextQ = i;
          break;
        }
      }
      if (progress.nextQ === num) {
        // All done
        progress.nextQ = TOTAL_QUESTIONS + 1;
      }
    }

    saveProgress();
    updateHeader();
  }

  function getSeenCount() {
    return Object.keys(progress.seen).length;
  }

  function getCorrectRate() {
    const entries = Object.values(progress.seen);
    if (entries.length === 0) return 0;
    const totalCorrect = entries.reduce((s, e) => s + (e.correct || 0), 0);
    const totalAttempts = entries.reduce((s, e) => s + (e.attempts || 0), 0);
    return totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  }

  function getWrongQuestions() {
    const wrong = [];
    for (const [num, e] of Object.entries(progress.seen)) {
      if (e.correct < e.attempts) {
        wrong.push(parseInt(num));
      }
    }
    return wrong;
  }

  // --- Queue ---
  function buildQueue() {
    if (quizMode === 'sequential') {
      // Start from nextQ, go through all remaining
      currentQueue = [];
      // Add from nextQ to end
      for (let i = progress.nextQ; i <= TOTAL_QUESTIONS; i++) {
        currentQueue.push(i);
      }
      // Add any unseen before nextQ (shouldn't happen normally but just in case)
      for (let i = 1; i < progress.nextQ; i++) {
        if (!progress.seen[i]) currentQueue.push(i);
      }
      queueIndex = 0;
    } else if (quizMode === 'weak') {
      const wrongNums = getWrongQuestions();
      currentQueue = wrongNums.sort(() => Math.random() - 0.5);
      queueIndex = 0;
    }
  }

  function getQuestionByNum(num) {
    return allQuestions.find(q => q.num === num);
  }

  // --- UI ---
  function updateHeader() {
    const seen = getSeenCount();
    document.getElementById('stat-seen').textContent = `${seen}/${TOTAL_QUESTIONS}`;
    document.getElementById('stat-correct').textContent = `${getCorrectRate()}%`;
    document.getElementById('stat-streak').textContent = `🔥 ${currentStreak}`;

    const pct = (seen / TOTAL_QUESTIONS) * 100;
    document.getElementById('progress-bar-fill').style.width = `${pct}%`;

    // Update menu descriptions
    const nextQ = progress.nextQ;
    const contDesc = document.getElementById('continue-desc');
    if (nextQ <= TOTAL_QUESTIONS) {
      contDesc.textContent = `السؤال التالي: ${nextQ}`;
    } else {
      contDesc.textContent = 'أكملت كل الأسئلة!';
    }

    const weakDesc = document.getElementById('weak-desc');
    weakDesc.textContent = `${getWrongQuestions().length} أسئلة خاطئة`;

    // Update typo button state
    const typoBtn = document.getElementById('btn-typo');
    if (typoBtn && currentQuestion) {
      if (flaggedTypos.includes(currentQuestion.num)) {
        typoBtn.classList.add('typped');
        typoBtn.textContent = '✏️ تم التعليم';
      } else {
        typoBtn.classList.remove('typped');
        typoBtn.textContent = '✏️ خطأ مطبعي';
      }
    }
  }

  function showNextQuestion() {
    if (quizMode === 'sequential' && progress.nextQ > TOTAL_QUESTIONS) {
      // All done!
      document.getElementById('quiz-card').style.display = 'none';
      document.getElementById('quiz-feedback').classList.add('hidden');
      document.getElementById('quiz-complete').classList.remove('hidden');
      document.getElementById('complete-stats').textContent = 
        `${getSeenCount()} سؤال — ${getCorrectRate()}% صحيح`;
      return;
    }

    if (quizMode === 'weak' && queueIndex >= currentQueue.length) {
      // No more wrong questions
      document.getElementById('quiz-card').style.display = 'none';
      document.getElementById('quiz-feedback').classList.add('hidden');
      document.getElementById('quiz-complete').classList.remove('hidden');
      document.getElementById('complete-emoji').textContent = '✅';
      document.getElementById('complete-title').textContent = 'أكملت مراجعة الأخطاء!';
      document.getElementById('complete-stats').textContent = 
        `${getSeenCount()} سؤال — ${getCorrectRate()}% صحيح`;
      return;
    }

    document.getElementById('quiz-card').style.display = 'block';
    document.getElementById('quiz-feedback').classList.add('hidden');
    document.getElementById('quiz-complete').classList.add('hidden');

    let qNum;
    if (quizMode === 'sequential') {
      qNum = progress.nextQ;
    } else {
      qNum = currentQueue[queueIndex];
    }

    currentQuestion = getQuestionByNum(qNum);
    if (!currentQuestion) {
      // Fallback: find next available
      for (let i = 1; i <= TOTAL_QUESTIONS; i++) {
        if (!progress.seen[i]) {
          currentQuestion = getQuestionByNum(i);
          break;
        }
      }
    }

    if (!currentQuestion) {
      document.getElementById('quiz-card').style.display = 'none';
      document.getElementById('quiz-complete').classList.remove('hidden');
      return;
    }

    // Render question
    const seen = getSeenCount();
    document.getElementById('question-num').textContent = 
      `السؤال ${currentQuestion.num} من ${TOTAL_QUESTIONS}`;
    document.getElementById('question-text').textContent = currentQuestion.question;

    const optionsEl = document.getElementById('options-list');
    optionsEl.innerHTML = '';

    const labels = ['A', 'B', 'C', 'D'];
    const optionKeys = Object.keys(currentQuestion.options);

    optionKeys.forEach((key, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="option-label">${labels[i]}.</span> ${currentQuestion.options[key]}`;
      btn.dataset.key = key;
      btn.addEventListener('click', () => handleAnswer(key));
      optionsEl.appendChild(btn);
    });

    answered = false;
    typoJustFlagged = false;

    // Reset typo button
    const typoBtn = document.getElementById('btn-typo');
    if (typoBtn) {
      if (flaggedTypos.includes(currentQuestion.num)) {
        typoBtn.classList.add('typped');
        typoBtn.textContent = '✏️ تم التعليم';
      } else {
        typoBtn.classList.remove('typped');
        typoBtn.textContent = '✏️ خطأ مطبعي';
      }
    }
  }

  function handleAnswer(selected) {
    if (answered) return;
    answered = true;

    const isCorrect = selected === currentQuestion.answer;
    recordAnswer(currentQuestion.num, isCorrect);

    // Highlight options
    const options = document.querySelectorAll('.option-btn');
    options.forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.key === currentQuestion.answer) {
        btn.classList.add('correct');
      } else if (btn.dataset.key === selected && !isCorrect) {
        btn.classList.add('wrong');
      }
    });

    // Show feedback
    const feedback = document.getElementById('quiz-feedback');
    feedback.classList.remove('hidden');
    feedback.classList.add(isCorrect ? 'correct-fb' : 'wrong-fb');

    document.getElementById('feedback-icon').textContent = isCorrect ? '✅' : '❌';
    document.getElementById('feedback-text').textContent = isCorrect
      ? 'أحسنت!' + (currentStreak >= 3 ? ` 🔥 سلسلة ${currentStreak}!` : '')
      : `الجواب الصحيح: ${currentQuestion.options[currentQuestion.answer]}`;

    if (quizMode === 'weak') {
      queueIndex++;
    }
  }

  function nextQuestion() {
    if (quizMode === 'weak') {
      // Move to next in weak queue
      showNextQuestion();
    } else {
      showNextQuestion();
    }
  }

  function startWeakReview() {
    const wrongNums = getWrongQuestions();
    if (wrongNums.length === 0) {
      alert('لا توجد أسئلة خاطئة للمراجعة! 🎉');
      return;
    }
    quizMode = 'weak';
    currentQueue = wrongNums.sort(() => Math.random() - 0.5);
    queueIndex = 0;
    currentStreak = progress.streak || 0;
    closeMenu();
    showNextQuestion();
  }

  function resetProgress() {
    if (confirm('هل أنت متأكد من إعادة تعيين كل التقدم؟ لا يمكن التراجع عن هذا.')) {
      progress = { seen: {}, streak: 0, bestStreak: 0, nextQ: 1 };
      currentStreak = 0;
      saveProgress();
      updateHeader();
      quizMode = 'sequential';
      buildQueue();
      closeMenu();
      showNextQuestion();
    }
  }

  function continueSequential() {
    quizMode = 'sequential';
    currentStreak = progress.streak || 0;
    buildQueue();
    closeMenu();
    showNextQuestion();
  }

  function showStats() {
    const seen = getSeenCount();
    const accuracy = getCorrectRate();
    const wrongNums = getWrongQuestions();

    document.getElementById('prog-seen').textContent = `${seen} / ${TOTAL_QUESTIONS}`;
    document.getElementById('prog-accuracy').textContent = `${accuracy}%`;
    document.getElementById('prog-streak').textContent = progress.bestStreak || 0;
    document.getElementById('prog-wrong').textContent = wrongNums.length;

    // Wrong list
    const wrongList = document.getElementById('wrong-list');
    wrongList.innerHTML = '';
    if (wrongNums.length === 0) {
      wrongList.innerHTML = '<div class="no-data">لا توجد أسئلة خاطئة 🎉</div>';
    } else {
      const wrongQuestions = allQuestions.filter(q => wrongNums.includes(q.num));
      wrongQuestions.slice(0, 20).forEach(q => {
        const div = document.createElement('div');
        div.className = 'wrong-item';
        div.textContent = `${q.num}. ${q.question.substring(0, 80)}...`;
        wrongList.appendChild(div);
      });
      if (wrongQuestions.length > 20) {
        const more = document.createElement('div');
        more.className = 'no-data';
        more.textContent = `+${wrongQuestions.length - 20} أسئلة أخرى`;
        wrongList.appendChild(more);
      }
    }

    // Typo list
    const typoList = document.getElementById('typo-list');
    const exportBtn = document.getElementById('btn-export-typos');
    typoList.innerHTML = '';
    if (flaggedTypos.length === 0) {
      typoList.innerHTML = '<div class="no-data">لم تعلم عن أي خطأ مطبعي بعد</div>';
      exportBtn.style.display = 'none';
    } else {
      exportBtn.style.display = 'inline-block';
      flaggedTypos.sort((a,b) => a-b).forEach(num => {
        const q = allQuestions.find(q => q.num === num);
        const div = document.createElement('div');
        div.className = 'typo-item';
        div.innerHTML = `<span class="typo-num">س${num}</span><span>${q ? q.question.substring(0, 50) + '...' : ''}</span><button class="typo-remove" data-num="${num}">✕</button>`;
        typoList.appendChild(div);
      });
      // Add remove handlers
      typoList.querySelectorAll('.typo-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const num = parseInt(e.target.dataset.num);
          unflagTypo(num);
          showStats(); // Refresh
        });
      });
    }

    closeMenu();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-stats').classList.add('active');
  }

  function backFromStats() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-quiz').classList.add('active');
  }

  function showAbout() {
    closeMenu();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-about').classList.add('active');
  }

  function backFromAbout() {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-quiz').classList.add('active');
  }

  function handleTypoFlag() {
    if (!currentQuestion) return;
    const num = currentQuestion.num;
    if (flaggedTypos.includes(num)) {
      unflagTypo(num);
    } else {
      flagTypo(num);
    }
    // Update button state
    const typoBtn = document.getElementById('btn-typo');
    if (flaggedTypos.includes(num)) {
      typoBtn.classList.add('typped');
      typoBtn.textContent = '✏️ تم التعليم';
    } else {
      typoBtn.classList.remove('typped');
      typoBtn.textContent = '✏️ خطأ مطبعي';
    }
  }

  // --- Menu ---
  function openMenu() {
    updateHeader();
    document.getElementById('menu-overlay').classList.remove('hidden');
  }

  function closeMenu() {
    document.getElementById('menu-overlay').classList.add('hidden');
  }

  // --- Events ---
  function bindEvents() {
    document.getElementById('btn-next').addEventListener('click', nextQuestion);
    document.getElementById('btn-menu').addEventListener('click', openMenu);
    document.getElementById('btn-close-menu').addEventListener('click', closeMenu);
    document.getElementById('btn-continue').addEventListener('click', continueSequential);
    document.getElementById('btn-weak').addEventListener('click', startWeakReview);
    document.getElementById('btn-reset-progress').addEventListener('click', resetProgress);
    document.getElementById('btn-stats').addEventListener('click', showStats);
    document.getElementById('btn-back-stats').addEventListener('click', backFromStats);
    document.getElementById('btn-about').addEventListener('click', showAbout);
    document.getElementById('btn-back-about').addEventListener('click', backFromAbout);
    document.getElementById('btn-typo').addEventListener('click', handleTypoFlag);
    document.getElementById('btn-export-typos').addEventListener('click', exportTypos);
    document.getElementById('btn-restart').addEventListener('click', resetProgress);

    // Close menu on overlay click
    document.getElementById('menu-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('menu-overlay')) closeMenu();
    });
  }

  // --- Start ---
  init();
})();