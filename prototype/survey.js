/* Shared survey presentation and browser-local interaction model. */
(() => {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const deadlineLabel = value => new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value));

  function isClosed(survey, now = Date.now()) {
    return now >= survey.closesAt;
  }

  function fromDraft(draft) {
    return {
      question: draft.question.trim(),
      choices: draft.choices.map((label, index) => ({ id: 'choice-' + index, label: label.trim() })),
      mode: draft.mode,
      closesAt: Date.parse(draft.closesAt + '+09:00'),
      responses: {},
      baseline: { participants: 0, counts: draft.choices.map(() => 0) }
    };
  }

  function totals(survey) {
    const responses = Object.values(survey.responses);
    return {
      participants: survey.baseline.participants + responses.length,
      counts: survey.choices.map((choice, index) =>
        survey.baseline.counts[index] + responses.filter(selected => selected.includes(choice.id)).length)
    };
  }

  function submit(survey, accountId, selected, { eligible, now = Date.now() }) {
    if (isClosed(survey, now)) return '마감된 설문에는 참여하거나 응답을 변경할 수 없어요.';
    if (!eligible) return '이 설문 지역에 유효한 인증이 있는 시민만 참여할 수 있어요.';
    const validIds = new Set(survey.choices.map(choice => choice.id));
    const unique = [...new Set(selected)];
    if (!unique.length || unique.some(id => !validIds.has(id))) return '선택지를 골라주세요.';
    if (survey.mode === 'single' && unique.length !== 1) return '하나의 선택지만 골라주세요.';
    survey.responses[accountId] = unique;
    return null;
  }

  function render(post, { eligible, accountId, denial }) {
    const survey = post.survey;
    const closed = isClosed(survey);
    const mine = accountId ? survey.responses[accountId] : null;
    const headingId = 'survey-title-' + post.id;
    const type = survey.mode === 'multiple' ? 'checkbox' : 'radio';
    const sum = closed ? totals(survey) : null;
    const choices = closed ? survey.choices.map((choice, index) => {
      const responses = sum.counts[index];
      const percent = sum.participants ? Math.round(responses / sum.participants * 100) : 0;
      return `<div class="survey-result"><div class="survey-result-label"><span>${escape(choice.label)}</span><strong>${percent}% <span class="small">${responses}명</span></strong></div><div class="survey-bar" role="meter" aria-label="${escape(choice.label)} 선택 비율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div></div>`;
    }).join('') : survey.choices.map(choice => `<label class="survey-vote-option"><input type="${type}" name="survey-vote-${post.id}" value="${escape(choice.id)}" ${mine?.includes(choice.id) ? 'checked' : ''} ${!eligible ? 'disabled' : ''}><span>${escape(choice.label)}</span></label>`).join('');
    return `<section class="survey" data-survey="${post.id}" aria-labelledby="${headingId}">
      <div class="survey-heading"><span class="pill ${closed ? 'neutral' : ''}">${closed ? '설문 마감' : '의견 수렴 중'}</span><span class="small">${survey.mode === 'multiple' ? '복수 선택' : '하나 선택'}</span></div>
      <h3 id="${headingId}">${escape(survey.question)}</h3>
      <p class="small survey-deadline">${deadlineLabel(survey.closesAt)} 마감 · 한국 시간</p>
      ${closed ? `<div class="survey-results">${choices}</div><p class="small">총 ${sum.participants}명 참여${survey.mode === 'multiple' ? ' · 참여자 수 기준 비율로 합계가 100%를 넘을 수 있어요.' : ''}</p>${sum.participants === 0 ? '<p class="small">참여한 응답이 없어 모든 항목이 0%로 표시돼요.</p>' : ''}` : `<form class="survey-vote-form" data-post="${post.id}">${choices}<div class="survey-vote-footer"><span class="small">${mine ? '응답을 제출했어요.' : '개인별 선택은 공개하지 않아요.'}</span><button class="primary" type="submit" ${!eligible ? 'disabled' : ''}>${mine ? '응답 변경' : '의견 제출'}</button></div></form><p class="small">마감 전까지 선택을 바꿀 수 있어요. 결과는 마감 후 공개해요.</p>${!eligible ? `<p class="survey-denial">${escape(denial)}</p>` : ''}`}
      ${closed && mine ? `<p class="survey-my-answer">내 응답: ${survey.choices.filter(choice => mine.includes(choice.id)).map(choice => escape(choice.label)).join(', ')}</p>` : ''}
    </section>`;
  }

  window.Survey = { isClosed, fromDraft, totals, submit, render };
})();
