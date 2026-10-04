"""Pinned CPU image encoder exporter. Project vocabularies are external profiles."""
import argparse, hashlib, json, pathlib, sys, time

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--recipe', type=pathlib.Path, required=True)
    args = parser.parse_args()
    import numpy as np
    import torch
    import onnx, onnxruntime as ort, transformers
    from transformers import CLIPModel
    recipe = json.loads(args.recipe.read_text())
    actual = dict(python=f'{sys.version_info.major}.{sys.version_info.minor}', torch=torch.__version__, transformers=transformers.__version__, onnx=onnx.__version__, onnxruntime=ort.__version__, numpy=np.__version__)
    if actual != recipe['tools']:
        raise RuntimeError(f'导出环境版本不符，要求 {recipe["tools"]}，当前 {actual}')
    torch.set_num_threads(2)
    model = CLIPModel.from_pretrained(recipe['source']['modelId'], revision=recipe['source']['revision']).eval()
    class ImageEncoder(torch.nn.Module):
        def __init__(self, m):
            super().__init__(); self.vision = m.vision_model; self.projection = m.visual_projection
        def forward(self, pixel_values):
            return self.projection(self.vision(pixel_values=pixel_values)[1])
    encoder = ImageEncoder(model).eval()
    x = torch.linspace(-2, 2, 3 * 224 * 224).reshape(1, 3, 224, 224)
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / 'image_encoder.onnx'
    torch.onnx.export(encoder, (x,), str(path), input_names=['pixel_values'], output_names=['image_features'], opset_version=recipe['opset'], dynamo=False)
    options = ort.SessionOptions(); options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
    with torch.no_grad(): reference = encoder(x).numpy()
    result = session.run(None, {'pixel_values': x.numpy()})[0]
    error = float(np.max(np.abs(result - reference)))
    if result.shape != (1, 512) or not np.isfinite(result).all() or error > 1e-4:
        raise RuntimeError(f'ONNX CPU 对照失败：{error}')
    with path.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != recipe['model']['sha256'] or path.stat().st_size != recipe['model']['bytes']:
        raise RuntimeError('导出字节不同于已准入版本，保留暂存结果，不自动注册')
    (args.output / 'probe.json').write_text(json.dumps(dict(tools=actual, max_abs_error=error, output_shape=list(result.shape), model_sha256=digest), indent=2) + '\n')
    print('ONNX CPU 对照通过', file=sys.stderr)

if __name__ == '__main__': main()
