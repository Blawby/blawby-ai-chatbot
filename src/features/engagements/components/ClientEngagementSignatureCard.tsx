import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { Pen } from 'lucide-preact';

import { cn } from '@/shared/utils/cn';

export interface ClientEngagementSignatureCardProps {
  /** PNG data URL of the current drawn signature, or null when blank. */
  signatureData: string | null;
  /** Today's date as a long string, e.g. "November 25, 2026". Shown in the sub copy. */
  todayLong: string;
  /** Fired whenever the canvas content changes; null when cleared. */
  onChange: (dataUrl: string | null) => void;
  /** Disable drawing + clear button (used while accept request in flight). */
  disabled?: boolean;
  className?: string;
}

/**
 * Signature card — 200px tall canvas with a dashed baseline + serif "×" at the
 * left edge serving as the signature baseline marker. Mirrors `.sig-card` and
 * `.sig-pad` in `design_handoff_blawby_chat_first/screens/EngagementReview.html`.
 *
 * Preserves the existing canvas-drawing pipeline from the old SignaturePad: the
 * canvas itself, the toDataURL serialization, the resize handler, and the clear
 * action. The only changes are:
 *   - pad height 128px → 200px
 *   - dashed baseline + "×" baseline indicator
 *   - "draw to sign" hint in the upper-right
 *   - audit footer line: "recorded with timestamp + IP at sign time"
 *   - card wrapper with serif heading "Sign here." and accent emphasis
 */
export const ClientEngagementSignatureCard: FunctionComponent<ClientEngagementSignatureCardProps> = ({
  signatureData,
  todayLong,
  onChange,
  disabled,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokeRef = useRef(false);

  const getContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = getContext();
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [getContext]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  const pointFromEvent = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (e instanceof MouseEvent) {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    const touch = e.touches[0] ?? e.changedTouches[0];
    if (!touch) return null;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const pt = pointFromEvent(e);
    if (!pt) return;
    drawingRef.current = true;
    lastPointRef.current = pt;
  }, [disabled, pointFromEvent]);

  const continueDraw = useCallback((e: MouseEvent | TouchEvent) => {
    if (disabled || !drawingRef.current) return;
    e.preventDefault();
    const pt = pointFromEvent(e);
    const ctx = getContext();
    const last = lastPointRef.current;
    if (!pt || !ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
    hasStrokeRef.current = true;
  }, [disabled, getContext, pointFromEvent]);

  const endDraw = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    if (hasStrokeRef.current) {
      const canvas = canvasRef.current;
      if (canvas) onChange(canvas.toDataURL('image/png'));
    }
  }, [onChange]);

  const clearPad = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    onChange(null);
  }, [getContext, onChange]);

  return (
    <section
      className={cn('card px-4 py-7 sm:px-8', className)}
      aria-labelledby="sig-card-heading"
    >
      <h3
        id="sig-card-heading"
        className="m-0 mb-1.5 font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.012em] text-ink"
      >
        Sign{' '}
        <em className="text-accent" style={{ fontStyle: 'italic' }}>here.</em>
      </h3>
      <p className="mb-[18px] text-[14px] leading-[1.55] text-ink-2">
        Draw your signature using your finger, trackpad, or mouse. By signing you agree to the terms above on{' '}
        <em className="text-accent-deep" style={{ fontStyle: 'italic' }}>{todayLong}</em>.
      </p>

      <div
        className={cn(
          'relative grid h-[200px] place-items-center rounded-[var(--r-sm)] border border-dashed border-rule bg-paper',
          disabled && 'opacity-60',
        )}
      >
        <canvas
          ref={canvasRef}
          className={cn(
            'absolute inset-0 h-full w-full rounded-[var(--r-sm)]',
            disabled ? 'cursor-not-allowed' : 'cursor-crosshair',
          )}
          onMouseDown={(e) => startDraw(e as unknown as MouseEvent)}
          onMouseMove={(e) => continueDraw(e as unknown as MouseEvent)}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={(e) => startDraw(e as unknown as TouchEvent)}
          onTouchMove={(e) => continueDraw(e as unknown as TouchEvent)}
          onTouchEnd={endDraw}
          aria-label="Signature pad"
        />

        {/* Baseline marker — dashed line + serif × at left edge */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-8 left-8 right-8 h-px bg-rule"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[38px] left-6 font-serif text-[22px] leading-none text-dim-2"
        >
          ×
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-3.5 font-mono text-[10px] uppercase tracking-[0.08em] text-dim-2"
        >
          draw to sign
        </span>

        {/* Empty-state hint sits centered until the user starts drawing. */}
        {!signatureData && !hasStrokeRef.current && (
          <span className="pointer-events-none flex items-center gap-2 text-[12px] text-dim-2">
            <Pen className="h-3.5 w-3.5" />
            Click or tap to draw
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col items-start justify-between gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-dim sm:flex-row sm:items-center">
        <span>recorded with timestamp · ip · device fingerprint · audit-logged</span>
        <button
          type="button"
          onClick={clearPad}
          disabled={disabled}
          className="cursor-pointer rounded-[var(--r-xs)] border border-rule bg-transparent px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-2 hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear &amp; redraw
        </button>
      </div>
    </section>
  );
};

export default ClientEngagementSignatureCard;
