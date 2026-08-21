
export function getStemEngineStatus(){
  return {
    available:false,
    label:'AI Stem Model Not Bundled',
    detail:'V1.1 is ready for a WebGPU/ONNX source-separation model.'
  };
}
export async function separateStems(){
  throw new Error('AI stem model is not bundled yet.');
}
