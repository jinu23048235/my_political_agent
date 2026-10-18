/* Pin rules are supplied explicitly after product policy confirmation. */
(() => {
  'use strict';
  function visible(post) {
    const ids = new Set(post.pinnedReplyIds || []);
    return post.replies.filter(reply => ids.has(reply.id) && !reply.hidden && !reply.deleted);
  }

  function toggle(post, replyId, { allowed, limit }) {
    if (!allowed) return '이 글의 댓글을 고정할 권한이 없어요.';
    const reply = post.replies.find(reply => reply.id === replyId && !reply.hidden && !reply.deleted);
    if (!reply) return '이 댓글은 고정할 수 없어요.';
    const current = visible(post).map(reply => reply.id);
    if (current.includes(replyId)) {
      post.pinnedReplyIds = current.filter(id => id !== replyId);
      return null;
    }
    if (limit === 1) {
      post.pinnedReplyIds = [replyId];
      return null;
    }
    if (!(limit > 1) || current.length >= limit) return '고정할 수 있는 댓글 수를 초과했어요.';
    post.pinnedReplyIds = [...current, replyId];
    return null;
  }

  window.PinnedReplies = { visible, toggle };
})();
