import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #a8ee76 0%, #95c755 100%)',
          borderRadius: 96,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 36,
            borderRadius: 80,
            background: 'rgba(255,255,255,0.22)',
          }}
        />
        <div
          style={{
            width: 260,
            height: 260,
            borderRadius: 72,
            background: '#0f120d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 28px 70px rgba(15,18,13,0.24)',
          }}
        >
          <span
            style={{
              color: '#a8ee76',
              fontSize: 170,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: '-0.08em',
              transform: 'translateY(-6px)',
            }}
          >
            S
          </span>
        </div>
      </div>
    ),
    size
  );
}
