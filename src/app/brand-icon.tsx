import { ImageResponse } from 'next/og';
import { brandArrowImage } from '@/lib/brand-mark';

export function brandIcon(size: number) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#ffd315',
        color: '#111712',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img src={brandArrowImage} width={size * 0.72} height={size * 0.72} alt="" />
    </div>,
    { width: size, height: size },
  );
}
