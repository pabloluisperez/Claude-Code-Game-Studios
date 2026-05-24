/**
 * ComfyUI workflow builder — small DSL for txt2img workflows.
 *
 * A "workflow" in ComfyUI is a JSON object keyed by node id. Each node has:
 *   { "inputs": {...}, "class_type": "CheckpointLoaderSimple" }
 *
 * Inputs can be literals or `[nodeId, outputIndex]` references to other nodes.
 *
 * This builder produces a minimal txt2img graph:
 *   1. CheckpointLoaderSimple → MODEL, CLIP, VAE
 *   2. (optional) LoraLoader chain
 *   3. CLIPTextEncode positive + negative
 *   4. EmptyLatentImage (configurable WxH)
 *   5. KSampler → LATENT
 *   6. VAEDecode → IMAGE
 *   7. SaveImage → output png with custom filename prefix
 *
 * Returns a workflow ready to pass to ComfyUIClient.queueWorkflow.
 */

export type WorkflowParams = {
  checkpoint: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number;
  /** Filename prefix for saved images. */
  filenamePrefix: string;
  /** Optional LoRA stack: applied left-to-right on top of the checkpoint. */
  loraStack?: ReadonlyArray<{ name: string; strengthModel: number; strengthClip: number }>;
};

type WorkflowNode = {
  inputs: Record<string, unknown>;
  class_type: string;
};

export function buildTxt2ImgWorkflow(params: WorkflowParams): Record<string, WorkflowNode> {
  const wf: Record<string, WorkflowNode> = {};
  let nextId = 1;
  const nid = (): string => String(nextId++);

  // 1. Checkpoint loader
  const ckptId = nid();
  wf[ckptId] = {
    inputs: { ckpt_name: params.checkpoint },
    class_type: 'CheckpointLoaderSimple',
  };

  // 2. LoRA chain (optional)
  let modelRef: [string, number] = [ckptId, 0];
  let clipRef: [string, number] = [ckptId, 1];
  for (const lora of params.loraStack ?? []) {
    const loraId = nid();
    wf[loraId] = {
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: lora.name,
        strength_model: lora.strengthModel,
        strength_clip: lora.strengthClip,
      },
      class_type: 'LoraLoader',
    };
    modelRef = [loraId, 0];
    clipRef = [loraId, 1];
  }

  // 3. Positive + negative encoding
  const posId = nid();
  wf[posId] = {
    inputs: { text: params.positivePrompt, clip: clipRef },
    class_type: 'CLIPTextEncode',
  };
  const negId = nid();
  wf[negId] = {
    inputs: { text: params.negativePrompt, clip: clipRef },
    class_type: 'CLIPTextEncode',
  };

  // 4. Latent
  const latentId = nid();
  wf[latentId] = {
    inputs: { width: params.width, height: params.height, batch_size: 1 },
    class_type: 'EmptyLatentImage',
  };

  // 5. KSampler
  const samplerId = nid();
  wf[samplerId] = {
    inputs: {
      model: modelRef,
      seed: params.seed,
      steps: params.steps,
      cfg: params.cfg,
      sampler_name: params.sampler,
      scheduler: params.scheduler,
      positive: [posId, 0],
      negative: [negId, 0],
      latent_image: [latentId, 0],
      denoise: 1.0,
    },
    class_type: 'KSampler',
  };

  // 6. VAE decode (uses VAE from checkpoint at output 2)
  const decodeId = nid();
  wf[decodeId] = {
    inputs: { samples: [samplerId, 0], vae: [ckptId, 2] },
    class_type: 'VAEDecode',
  };

  // 7. SaveImage
  const saveId = nid();
  wf[saveId] = {
    inputs: { images: [decodeId, 0], filename_prefix: params.filenamePrefix },
    class_type: 'SaveImage',
  };

  return wf;
}
