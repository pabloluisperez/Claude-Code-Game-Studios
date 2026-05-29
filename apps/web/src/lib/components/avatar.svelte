<!--
  Avatar — composable SVG face generated deterministically from a seed.

  Layers (bottom → top): frame · neck · face · ears · hair · brows · eyes ·
  optional glasses · nose · mouth · optional beard.

  Each layer picks a variant from a small enum using a stable hash of the
  seed. Same seed → same face on every render.

  Story: Alma Pass v3 — avatars
  Control Manifest: 2026-05-20
-->
<script lang="ts">
  interface Props {
    seed: string;
    size?: number;
    /** Show the frame + name caption (carnet/portrait style). */
    framed?: boolean;
    caption?: string;
    /** Force a feminine look (long hair, no facial hair). Pablo 2026-05-29. */
    female?: boolean;
  }

  let { seed, size = 64, framed = false, caption, female = false }: Props = $props();

  // ── Hash + pick helpers ─────────────────────────────────────────────────
  function hash32(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  function pick<T>(arr: readonly T[], h: number, salt: string): T {
    const k = hash32(seed + ':' + salt) ^ h;
    return arr[k % arr.length]!;
  }

  // ── Palettes ────────────────────────────────────────────────────────────
  const SKIN  = ['#f4d4ad', '#e8b48d', '#c98967', '#a96637', '#6f4226'];
  const HAIR  = ['#1f1a17', '#3b2c1e', '#7a4a23', '#b87333', '#d8a448', '#dcdcdc'];
  const SHIRT = ['#1e3a8a', '#7c2d12', '#166534', '#5b21b6', '#9f1239', '#0f172a'];
  const EYES  = ['#3b2c1e', '#1e40af', '#166534', '#52525b'];

  // ── Layered variants ────────────────────────────────────────────────────
  type FaceShape = 'oval' | 'round' | 'square';
  type HairStyle =
    | 'bald'
    | 'short'
    | 'side-part'
    | 'curly'
    | 'mohawk'
    | 'cap'
    | 'long';
  type Glasses = 'none' | 'normal' | 'shades';
  type Mouth = 'neutral' | 'smile' | 'serious';
  type Facial = 'none' | 'goatee' | 'beard' | 'moustache';

  const h = $derived(hash32(seed));
  const skin  = $derived(pick(SKIN,  h, 'skin'));
  const hair  = $derived(pick(HAIR,  h, 'hair'));
  const shirt = $derived(pick(SHIRT, h, 'shirt'));
  const eyeC  = $derived(pick(EYES,  h, 'eye'));
  const face  = $derived(pick(['oval', 'round', 'square'] as FaceShape[], h, 'face'));
  // Women get long hair and no facial hair for a more realistic look; men keep
  // the full deterministic variety. (Pablo 2026-05-29.)
  const style = $derived(
    female
      ? 'long'
      : pick(['bald', 'short', 'side-part', 'curly', 'mohawk', 'cap', 'long'] as HairStyle[], h, 'style'),
  );
  const glasses = $derived(pick(['none', 'none', 'none', 'normal', 'shades'] as Glasses[], h, 'glasses'));
  const mouth = $derived(pick(['neutral', 'smile', 'smile', 'serious'] as Mouth[], h, 'mouth'));
  const facial = $derived(
    female ? 'none' : pick(['none', 'none', 'none', 'goatee', 'beard', 'moustache'] as Facial[], h, 'facial'),
  );

  // Face shape paths (viewBox 0 0 100 100)
  const faceShape = $derived.by(() => {
    if (face === 'round')  return { rx: 28, ry: 30 };
    if (face === 'square') return { rx: 27, ry: 30 };
    return { rx: 25, ry: 32 }; // oval (default)
  });
</script>

<div
  class="avatar-root inline-flex flex-col items-center"
  style="width: {size}px;"
>
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    aria-label={caption ?? 'avatar'}
    class="block"
  >
    <!-- Frame -->
    {#if framed}
      <rect width="100" height="100" rx="6" ry="6" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" />
      <rect x="1.5" y="1.5" width="97" height="97" rx="5" fill="none" stroke="#cbd5e1" stroke-width="0.5" stroke-dasharray="2 2" />
    {:else}
      <circle cx="50" cy="50" r="49" fill="#f1f5f9" />
    {/if}

    <!-- Shirt collar -->
    <rect x="20" y="80" width="60" height="20" fill={shirt} />
    <polygon points="35,80 50,90 65,80" fill="#f8fafc" />

    <!-- Neck -->
    <rect x="42" y="70" width="16" height="14" fill={skin} />

    <!-- Face -->
    <ellipse cx="50" cy="46" rx={faceShape.rx} ry={faceShape.ry} fill={skin} />

    <!-- Ears -->
    <ellipse cx={50 - faceShape.rx + 2} cy="50" rx="3" ry="5" fill={skin} />
    <ellipse cx={50 + faceShape.rx - 2} cy="50" rx="3" ry="5" fill={skin} />

    <!-- Hair -->
    {#if style === 'short'}
      <path d="M 22 38 Q 50 14, 78 38 L 78 46 Q 50 30, 22 46 Z" fill={hair} />
    {:else if style === 'side-part'}
      <path d="M 22 38 Q 35 16, 78 28 L 78 44 Q 60 30, 22 46 Z" fill={hair} />
    {:else if style === 'curly'}
      <circle cx="35" cy="28" r="9" fill={hair} />
      <circle cx="50" cy="22" r="11" fill={hair} />
      <circle cx="65" cy="28" r="9" fill={hair} />
      <circle cx="74" cy="38" r="6" fill={hair} />
      <circle cx="26" cy="38" r="6" fill={hair} />
    {:else if style === 'mohawk'}
      <rect x="46" y="12" width="8" height="24" fill={hair} />
      <path d="M 30 38 Q 50 32, 70 38 L 70 44 Q 50 38, 30 44 Z" fill={hair} />
    {:else if style === 'cap'}
      <path d="M 22 38 Q 50 18, 78 38 L 78 42 L 22 42 Z" fill={shirt} />
      <ellipse cx="78" cy="40" rx="14" ry="3" fill={shirt} />
    {:else if style === 'long'}
      <path d="M 18 38 Q 50 14, 82 38 L 82 70 L 76 70 L 76 44 Q 50 32, 24 44 L 24 70 L 18 70 Z" fill={hair} />
    {/if}
    <!-- Bald: nothing -->

    <!-- Brows -->
    <rect x="36" y="40" width="10" height="2" rx="1" fill={hair} />
    <rect x="54" y="40" width="10" height="2" rx="1" fill={hair} />

    <!-- Eyes -->
    <circle cx="41" cy="48" r="2.5" fill="#fff" />
    <circle cx="59" cy="48" r="2.5" fill="#fff" />
    <circle cx="41" cy="48" r="1.5" fill={eyeC} />
    <circle cx="59" cy="48" r="1.5" fill={eyeC} />

    <!-- Glasses overlay -->
    {#if glasses === 'normal'}
      <circle cx="41" cy="48" r="5" fill="none" stroke="#222" stroke-width="1.2" />
      <circle cx="59" cy="48" r="5" fill="none" stroke="#222" stroke-width="1.2" />
      <line x1="46" y1="48" x2="54" y2="48" stroke="#222" stroke-width="1.2" />
    {:else if glasses === 'shades'}
      <rect x="36" y="44" width="10" height="7" rx="2" fill="#222" />
      <rect x="54" y="44" width="10" height="7" rx="2" fill="#222" />
      <line x1="46" y1="48" x2="54" y2="48" stroke="#222" stroke-width="1.2" />
    {/if}

    <!-- Nose -->
    <path d="M 50 50 Q 47 58, 50 61 L 52 61" fill="none" stroke={hair} stroke-width="0.9" stroke-opacity="0.7" />

    <!-- Mouth -->
    {#if mouth === 'smile'}
      <path d="M 43 66 Q 50 71, 57 66" fill="none" stroke="#5b1d1d" stroke-width="1.4" stroke-linecap="round" />
    {:else if mouth === 'serious'}
      <line x1="43" y1="67" x2="57" y2="67" stroke="#5b1d1d" stroke-width="1.4" stroke-linecap="round" />
    {:else}
      <path d="M 44 66 Q 50 68, 56 66" fill="none" stroke="#5b1d1d" stroke-width="1.4" stroke-linecap="round" />
    {/if}

    <!-- Facial hair -->
    {#if facial === 'moustache'}
      <path d="M 42 63 Q 50 66, 58 63 Q 54 65, 50 64.5 Q 46 65, 42 63 Z" fill={hair} />
    {:else if facial === 'goatee'}
      <path d="M 46 68 Q 50 76, 54 68 Q 52 72, 50 73 Q 48 72, 46 68 Z" fill={hair} />
    {:else if facial === 'beard'}
      <path d="M 30 60 Q 35 78, 50 78 Q 65 78, 70 60 Q 65 70, 50 70 Q 35 70, 30 60 Z" fill={hair} opacity="0.85" />
    {/if}
  </svg>

  {#if caption}
    <div class="text-xs mt-1 font-medium truncate w-full text-center">{caption}</div>
  {/if}
</div>
