// GridWars — Virtual Joystick for mobile grid navigation
import { useRef, useCallback, useEffect, memo } from 'react';

const JOYSTICK_SIZE = 110;
const KNOB_SIZE = 44;
const MAX_DISTANCE = (JOYSTICK_SIZE - KNOB_SIZE) / 2;

function Joystick({ onMove, onEnd }) {
  const containerRef = useRef(null);
  const knobRef = useRef(null);
  const activeRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(null);

  const handleStart = useCallback((clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    originRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    activeRef.current = true;
    handleMove(clientX, clientY);
  }, []);

  const handleMove = useCallback((clientX, clientY) => {
    if (!activeRef.current || !knobRef.current) return;

    let dx = clientX - originRef.current.x;
    let dy = clientY - originRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp to max distance
    if (dist > MAX_DISTANCE) {
      dx = (dx / dist) * MAX_DISTANCE;
      dy = (dy / dist) * MAX_DISTANCE;
    }

    knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;

    // Normalize to -1..1
    const nx = dx / MAX_DISTANCE;
    const ny = dy / MAX_DISTANCE;

    // Throttle via rAF
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      onMove(nx, ny);
    });
  }, [onMove]);

  const handleEnd = useCallback(() => {
    activeRef.current = false;
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0, 0)';
    }
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    onEnd?.();
  }, [onEnd]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      handleStart(t.clientX, t.clientY);
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      const t = e.touches[0];
      handleMove(t.clientX, t.clientY);
    };
    const onTouchEnd = (e) => {
      e.preventDefault();
      handleEnd();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleStart, handleMove, handleEnd]);

  return (
    <div className="joystick" ref={containerRef}>
      <div className="joystick__base">
        <div className="joystick__knob" ref={knobRef} />
      </div>
    </div>
  );
}

export default memo(Joystick);
