/**
 * ComfyUI hi-res fix workflow builder — canonical 2-pass generation.
 *
 * Standard txt2img generates at one resolution. For pixel art with the
 * pixel-art-xl LoRA we hit a ceiling: at 1024² we get chunky pixels but
 * limited detail; going to 2048² breaks SDXL's coherence (out-of-bounds).
 *
 * Hi-res fix solves this with a 2-pass workflow:
 *
 *   Pass 1: KSampler at base resolution (e.g. 1024²) + LoRA 1.0 + denoise 1.0
 *           → generates cohesive composition with full pixel art character
 *
 *   LatentUpscaleBy: upscale the latent (not the decoded image) by a factor
 *                    (1.5× or 2×) using nearest-exact (preserves pixel grid)
 *
 *   Pass 2: KSampler at upscaled resolution + LoRA (same or reduced) +
 *           denoise 0.3-0.5 → adds detail in the new pixels while keeping
 *           the original composition locked
 *
 *   VAEDecode + SaveImage
 *
 * Net effect: bigger image with the same chunky pixel art style. Pixels are
 * "smaller" relative to total image size, but they remain hard-edged.
 */

export type HiResFixLoraEntry = {
  name: string;
  strengthModel: number;
  strengthClip: number;
};

export type HiResFixParams = {
  checkpoint: string;
  positivePrompt: string;
  negativePrompt: string;

  /** First-pass resolution. SDXL native is 1024x1024. */
  baseWidth: number;
  baseHeight: number;

  /** Latent upscale factor for the second pass. 1.5 is safe; 2.0 is aggressive. */
  upscaleBy: number;

  /** Upscale method. 'nearest-exact' preserves pixel grid; 'bilinear' is smoother. */
  upscaleMethod?: 'nearest-exact' | 'bilinear' | 'area' | 'bicubic' | 'bislerp';

  /** Sampling steps for first pass (composition). */
  steps: number;

  /** Sampling steps for second pass (detail). Defaults to `steps`. */
  secondPassSteps?: number;

  /** CFG scale (both passes use the same). */
  cfg: number;

  /** Sampler name (e.g., 'euler', 'dpmpp_2m'). Both passes use the same. */
  sampler: string;

  /** Scheduler (e.g., 'karras', 'normal'). Both passes use the same. */
  scheduler: string;

  /** Deterministic seed. Pass 2 derives from this. */
  seed: number;

  /** Denoise for the second pass. 0.3-0.5 keeps composition; 0.6+ risks drift. */
  secondPassDenoise: number;

  /** Filename prefix for the saved PNG. */
  filenamePrefix: string;

  /** LoRA stack applied to the first pass. */
  loraStack?: ReadonlyArray<HiResFixLoraEntry>;

  /**
   * Optional override for second-pass LoRA strengths. If omitted, the same
   * stack as the first pass is used. For pixel art, lowering strength on
   * pass 2 (e.g., 0.6) gives finer detail while keeping the pixel character.
   */
  secondPassLoraStack?: ReadonlyArray<HiResFixLoraEntry>;
};

type WorkflowNode = {
  inputs: Record<string, unknown>;
  class_type: string;
};

export function buildHiResFixWorkflow(params: HiResFixParams): Record<string, WorkflowNode> {
  const wf: Record<string, WorkflowNode> = {};
  let nextId = 1;
  const nid = (): string => String(nextId++);

  const upscaleMethod = params.upscaleMethod ?? 'nearest-exact';
  const secondPassSteps = params.secondPassSteps ?? params.steps;
  const secondPassStack = params.secondPassLoraStack ?? params.loraStack ?? [];

  // 1. Checkpoint loader (shared by both passes)
  const ckptId = nid();
  wf[ckptId] = {
    inputs: { ckpt_name: params.checkpoint },
    class_type: 'CheckpointLoaderSimple',
  };

  // 2a. LoRA chain for first pass
  let p1ModelRef: [string, number] = [ckptId, 0];
  let p1ClipRef: [string, number] = [ckptId, 1];
  for (const lora of params.loraStack ?? []) {
    const loraId = nid();
    wf[loraId] = {
      inputs: {
        model: p1ModelRef,
        clip: p1ClipRef,
        lora_name: lora.name,
        strength_model: lora.strengthModel,
        strength_clip: lora.strengthClip,
      },
      class_type: 'LoraLoader',
    };
    p1ModelRef = [loraId, 0];
    p1ClipRef = [loraId, 1];
  }

  // 2b. LoRA chain for second pass (may differ in strengths)
  let p2ModelRef: [string, number] = [ckptId, 0];
  let p2ClipRef: [string, number] = [ckptId, 1];
  for (const lora of secondPassStack) {
    const loraId = nid();
    wf[loraId] = {
      inputs: {
        model: p2ModelRef,
        clip: p2ClipRef,
        lora_name: lora.name,
        strength_model: lora.strengthModel,
        strength_clip: lora.strengthClip,
      },
      class_type: 'LoraLoader',
    };
    p2ModelRef = [loraId, 0];
    p2ClipRef = [loraId, 1];
  }

  // 3a. Positive + negative encoding for first pass
  const p1PosId = nid();
  wf[p1PosId] = {
    inputs: { text: params.positivePrompt, clip: p1ClipRef },
    class_type: 'CLIPTextEncode',
  };
  const p1NegId = nid();
  wf[p1NegId] = {
    inputs: { text: params.negativePrompt, clip: p1ClipRef },
    class_type: 'CLIPTextEncode',
  };

  // 3b. Positive + negative encoding for second pass (different CLIP if LoRA stack changed)
  const p2PosId = nid();
  wf[p2PosId] = {
    inputs: { text: params.positivePrompt, clip: p2ClipRef },
    class_type: 'CLIPTextEncode',
  };
  const p2NegId = nid();
  wf[p2NegId] = {
    inputs: { text: params.negativePrompt, clip: p2ClipRef },
    class_type: 'CLIPTextEncode',
  };

  // 4. Empty latent at base resolution
  const latentId = nid();
  wf[latentId] = {
    inputs: { width: params.baseWidth, height: params.baseHeight, batch_size: 1 },
    class_type: 'EmptyLatentImage',
  };

  // 5. First-pass KSampler (denoise 1.0 — generates from scratch)
  const p1SamplerId = nid();
  wf[p1SamplerId] = {
    inputs: {
      model: p1ModelRef,
      seed: params.seed,
      steps: params.steps,
      cfg: params.cfg,
      sampler_name: params.sampler,
      scheduler: params.scheduler,
      positive: [p1PosId, 0],
      negative: [p1NegId, 0],
      latent_image: [latentId, 0],
      denoise: 1.0,
    },
    class_type: 'KSampler',
  };

  // 6. Upscale the latent (NOT the decoded image — keeps coherence)
  const upscaleId = nid();
  wf[upscaleId] = {
    inputs: {
      samples: [p1SamplerId, 0],
      upscale_method: upscaleMethod,
      scale_by: params.upscaleBy,
    },
    class_type: 'LatentUpscaleBy',
  };

  // 7. Second-pass KSampler (low denoise — refines without breaking composition)
  const p2SamplerId = nid();
  wf[p2SamplerId] = {
    inputs: {
      model: p2ModelRef,
      // Use seed + 1 for the refinement pass — slight variation but deterministic
      seed: params.seed + 1,
      steps: secondPassSteps,
      cfg: params.cfg,
      sampler_name: params.sampler,
      scheduler: params.scheduler,
      positive: [p2PosId, 0],
      negative: [p2NegId, 0],
      latent_image: [upscaleId, 0],
      denoise: params.secondPassDenoise,
    },
    class_type: 'KSampler',
  };

  // 8. VAE decode (use VAE from checkpoint, output index 2)
  const decodeId = nid();
  wf[decodeId] = {
    inputs: { samples: [p2SamplerId, 0], vae: [ckptId, 2] },
    class_type: 'VAEDecode',
  };

  // 9. SaveImage
  const saveId = nid();
  wf[saveId] = {
    inputs: { images: [decodeId, 0], filename_prefix: params.filenamePrefix },
    class_type: 'SaveImage',
  };

  return wf;
}
