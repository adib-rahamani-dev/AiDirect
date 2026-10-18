import { ImageResponse } from 'next/og';
import { brandArrowImage } from '@/lib/brand-mark';

export const alt = 'AiDirect؛ از کامنت تا گفتگو — نسخهٔ آزمایشی کامنت به دایرکت';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#111712',
        color: '#f5f2e8',
        padding: '58px 65px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 84, fontWeight: 700 }}>
          aidirect<span style={{ color: '#ffd315' }}>.</span>
        </div>
        <div
          style={{
            display: 'flex',
            padding: 18,
            borderRadius: 22,
            background: '#ffd315',
            color: '#111712',
          }}
        >
          <img src={brandArrowImage} width={68} height={68} alt="" />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          fontSize: 66,
          lineHeight: 1.25,
          fontWeight: 700,
        }}
      >
        <span>From a comment.</span>
        <span style={{ color: '#ffd315' }}>To a conversation.</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #46513f',
          paddingTop: 24,
          fontSize: 23,
          color: '#c2c9bc',
        }}
      >
        <span>Instagram comment-to-DM</span>
        <span>TEST VERSION</span>
      </div>
    </div>,
    size,
  );
}
