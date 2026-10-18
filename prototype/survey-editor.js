/* Browser-local survey editor. Product rules are supplied by the caller. */
(() => {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function create() {
    return { enabled: false, question: '', choices: ['', ''], mode: 'single', closesAt: '' };
  }

  function render(draft, { modes = ['single', 'multiple'] } = {}) {
    return `<section class="survey-editor" aria-labelledby="survey-editor-title">
      <div class="setting-row"><h2 id="survey-editor-title">선택형 설문</h2>
        <label class="survey-enable"><span class="small">설문 추가</span>
          <input class="switch" id="survey-enabled" type="checkbox" role="switch" ${draft.enabled ? 'checked' : ''}>
        </label>
      </div>
      ${draft.enabled ? `<div class="form-field"><label for="survey-question">설문 질문</label>
        <input type="text" id="survey-question" value="${escape(draft.question)}" required placeholder="이웃에게 어떤 의견을 듣고 싶나요?">
      </div>
      <fieldset class="survey-choices"><legend>선택지</legend>
        ${draft.choices.map((choice, index) => `<div class="survey-choice-row">
          <label class="sr-only" for="survey-choice-${index}">선택지 ${index + 1}</label>
          <input type="text" id="survey-choice-${index}" name="survey-choice" value="${escape(choice)}" required placeholder="선택지 ${index + 1}">
          <button class="chip" type="button" data-action="survey-remove-choice" data-id="${index}" ${draft.choices.length <= 2 ? 'disabled' : ''} aria-label="선택지 ${index + 1} 삭제">×</button>
        </div>`).join('')}
        <button class="text-button" type="button" data-action="survey-add-choice">＋ 선택지 추가</button>
      </fieldset>
      <div class="form-field"><label for="survey-mode">선택 방식</label>
        <select class="chip" id="survey-mode">${modes.map(mode => `<option value="${mode}" ${draft.mode === mode ? 'selected' : ''}>${mode === 'multiple' ? '복수 선택' : '단일 선택'}</option>`).join('')}</select>
      </div>
      <div class="form-field"><label for="survey-close">마감 날짜·시간</label>
        <input type="datetime-local" id="survey-close" value="${escape(draft.closesAt)}" required aria-describedby="survey-timezone">
        <div class="small" id="survey-timezone">한국 시간 기준</div>
      </div>` : ''}
    </section>`;
  }

  function read(root, previous) {
    const enabled = root.querySelector('#survey-enabled');
    if (!enabled) return previous;
    if (!root.querySelector('#survey-question')) return { ...previous, enabled: enabled.checked };
    return {
      enabled: enabled.checked,
      question: root.querySelector('#survey-question')?.value ?? previous.question,
      choices: [...root.querySelectorAll('[name=survey-choice]')].map(input => input.value),
      mode: root.querySelector('#survey-mode')?.value ?? previous.mode,
      closesAt: root.querySelector('#survey-close')?.value ?? previous.closesAt
    };
  }

  function validate(draft, now = Date.now()) {
    if (!draft.enabled) return null;
    if (!['single', 'multiple'].includes(draft.mode)) return '선택 방식을 확인해주세요.';
    if (!draft.question.trim()) return '설문 질문을 입력해주세요.';
    const choices = draft.choices.map(choice => choice.trim());
    if (choices.length < 2 || choices.some(choice => !choice)) return '서로 다른 선택지를 두 개 이상 입력해주세요.';
    if (new Set(choices).size !== choices.length) return '선택지 내용이 중복되지 않게 입력해주세요.';
    const closesAt = Date.parse(draft.closesAt + '+09:00');
    if (!Number.isFinite(closesAt) || closesAt <= now) return '마감은 현재보다 이후의 한국 시간으로 정해주세요.';
    return null;
  }

  window.SurveyEditor = { create, render, read, validate };
})();
