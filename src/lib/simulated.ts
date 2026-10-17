import type { InstagramAdapter, Comment } from './meta';
export const SIM_ACCOUNT = '90001';
export const SIM_MEDIA = '90002';
export const SIM_COMMENT = '90003';
export function simulationComment(): Comment {
  return {
    id: SIM_COMMENT,
    text: 'لینک',
    timestamp: new Date().toISOString(),
    media: { id: SIM_MEDIA, media_product_type: 'FEED' },
    from: { id: '90004', username: 'simulation' },
  };
}
export const simulatedAdapter: InstagramAdapter = {
  kind: 'simulated',
  async media() {
    return [
      {
        id: SIM_MEDIA,
        caption: 'رسانهٔ شبیه‌سازی؛ هیچ اتصال واقعی وجود ندارد',
        media_type: 'IMAGE',
        media_product_type: 'FEED',
      },
    ];
  },
  async comments() {
    return [simulationComment()];
  },
  async comment(id) {
    return { ...simulationComment(), id };
  },
  async send(_id, commentId) {
    return { messageId: `simulated:${commentId}` };
  },
};
