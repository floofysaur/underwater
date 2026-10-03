// @ts-nocheck
// Figma custom shader effect: "Interactive glowing particles"
// Luminous bokeh particles sampled from the source layer that drift and respond to the
// pointer with configurable attraction or repulsion.

export function setup(device, frame) {
    var wgsl = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  frameData: vec4f,
  inputDimsData: vec4f,
  mouseData: vec4f,
  pointerMode: vec4f,
  interactionStrength: vec4f,
  interactionRadius: vec4f,
  interactionFalloff: vec4f,
  particleRegion: vec4f,
  density: vec4f,
  particleCount: vec4f,
  particleSize: vec4f,
  glowIntensity: vec4f,
  particleSpeed: vec4f,
  drift: vec4f,
  trails: vec4f,
  sourceSampling: vec4f,
  particleColor: vec4f,
  accentColor: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn sampleInput(p: vec2f) -> vec4f {
  return textureSampleLevel(inputTex, samp, clamp(p, vec2f(0.0), vec2f(1.0)), 0.0);
}

// Like sampleInput but returns transparent (premultiplied zero) outside the
// input rect instead of repeating the edge texel.
fn sampleInputOrZero(p: vec2f) -> vec4f {
  let inside = step(vec2f(0.0), p) * step(p, vec2f(1.0));
  return sampleInput(p) * (inside.x * inside.y);
}

fn particleHash(n: f32) -> f32 {

  return fract(sin(n * 127.1 + 311.7) * 43758.5453123);

}

fn segmentDistance(p: vec2f, a: vec2f, b: vec2f) -> f32 {

  let pa = p - a;

  let ba = b - a;

  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);

  return length(pa - ba * h);

}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(@location(0) outputUv_in: vec2f) -> @location(0) vec4f {
  let time = u.frameData.x;
  let outputUv = outputUv_in;
  let dims = max(u.frameData.yz, vec2f(1.0));
  let inputDims = max(u.inputDimsData.xy, vec2f(1.0));
  let inputTexel = vec2f(1.0) / inputDims;
  let uv = outputUv;
  // texel and aspect are input-relative to match uv. Zoom fills rescale texel
  // alongside their uv redefinition below (see zoomLocal).
  let texel = inputTexel;
  let aspect = inputDims.x / max(inputDims.y, 1.0);
  let mousePx = u.mouseData.xy;
  let mouse = u.mouseData.zw;
  // pointerMode: 0=attract, 1=repel
  let pointerMode = i32(u.pointerMode.x + 0.5);
  let interactionStrength = u.interactionStrength.x;
  let interactionRadius = u.interactionRadius.x;
  let interactionFalloff = u.interactionFalloff.x;
  let particleRegion = u.particleRegion;
  let density = u.density.x;
  let particleCount = u.particleCount.x;
  let particleSize = u.particleSize.x;
  let glowIntensity = u.glowIntensity.x;
  let particleSpeed = u.particleSpeed.x;
  let drift = u.drift.x;
  let trails = u.trails.x;
  let sourceSampling = u.sourceSampling.x >= 0.5;
  let particleColor = u.particleColor;
  let accentColor = u.accentColor;
  let inputColor = sampleInput(uv);
  let baseColor = inputColor;
  let minDim = max(min(dims.x, dims.y), 1.0);
  let radiusPx = max(interactionRadius * 0.01 * minDim, 1.0);
  let regionCenter = particleRegion.xy * 0.01 * dims;
  let regionRadiusPx = max(particleRegion.z * 0.01 * minDim, 1.0);
  let pointer = mousePx;
  let now = time * 0.001 * particleSpeed;
  var glowRgb = vec3f(0.0);
  var glowAlpha = 0.0;
  for (var i: i32 = 0; i < 160; i = i + 1) {
    if (f32(i) >= min(particleCount * density, 160.0)) {
      break;
    }
    let fi = f32(i) + 1.0;
    let seedX = particleHash(fi * 1.17);
    let seedY = particleHash(fi * 2.31 + 9.0);
    let phase = particleHash(fi * 4.73 + 3.0) * 6.2831853;
    let scaleJitter = mix(0.55, 1.45, particleHash(fi * 7.91));
    let regionAngle = seedX * 6.2831853;
    let regionDistance = sqrt(seedY) * regionRadiusPx;
    let basePos = regionCenter + vec2f(cos(regionAngle), sin(regionAngle)) * regionDistance;
    let orbit = vec2f(
      sin(now * mix(0.25, 0.7, seedY) + phase),
      cos(now * mix(0.2, 0.6, seedX) + phase * 1.37)
    );
    let driftPx = drift * minDim * 0.08;
    var particlePos = basePos + orbit * driftPx;
    let pointerDelta = pointer - particlePos;
    let pointerDistance = length(pointerDelta);
    let normalizedDistance = clamp(pointerDistance / radiusPx, 0.0, 1.0);
    let pointerActive = pointer.x >= 0.0 && pointer.y >= 0.0 && pointer.x <= dims.x && pointer.y <= dims.y;
    let influence = pow(1.0 - normalizedDistance, interactionFalloff) * interactionStrength * select(0.0, 1.0, pointerActive);
    let pointerDirection = pointerDelta / max(pointerDistance, 1.0);
    let modeSign = select(1.0, -1.0, pointerMode == 1);
    particlePos = particlePos + pointerDirection * influence * radiusPx * 0.38 * modeSign;
    let velocity = vec2f(
      cos(now * mix(0.25, 0.7, seedY) + phase) * mix(0.25, 0.7, seedY),
      -sin(now * mix(0.2, 0.6, seedX) + phase * 1.37) * mix(0.2, 0.6, seedX)
    );
    let velocityDirection = velocity / max(length(velocity), 0.001);
    let sizePx = max(particleSize * scaleJitter, 0.5);
    let trailEnd = particlePos - velocityDirection * sizePx * trails * 7.0;
    let distancePx = length(uv * dims - particlePos);
    let trailDistancePx = length(uv * dims - trailEnd);
    let halo = exp(-distancePx * distancePx / max(sizePx * sizePx * 2.2, 0.01));
    let core = exp(-distancePx * distancePx / max(sizePx * sizePx * 0.16, 0.01));
    let trailDot = exp(-trailDistancePx * trailDistancePx / max(sizePx * sizePx * 0.32, 0.01)) * trails * 0.28;
    let particleUv = particlePos / dims;
    let sourceColor = sampleInputOrZero(particleUv);
    let sourceAlpha = max(sourceColor.a, 0.0001);
    let sourceStraight = sourceColor.rgb / sourceAlpha;
    let luminance = dot(sourceStraight, vec3f(0.2126, 0.7152, 0.0722)) * sourceColor.a;
    let fallback = mix(particleColor.rgb, accentColor.rgb, particleHash(fi * 11.13));
    let chosenColor = select(fallback, sourceStraight, sourceSampling && sourceColor.a > 0.001);
    let sourceWeight = select(1.0, 0.12 + pow(clamp(luminance, 0.0, 1.0), 1.35) * 1.35, sourceSampling);
    let opacity = clamp((halo * 0.34 + core * 0.92 + trailDot) * glowIntensity * sourceWeight * particleColor.a, 0.0, 1.0);
    glowRgb = glowRgb + chosenColor * opacity;
    glowAlpha = glowAlpha + opacity * (1.0 - glowAlpha);
  }
  let particleAlpha = clamp(glowAlpha, 0.0, 1.0);
  let particlePremul = min(glowRgb, vec3f(particleAlpha));
  let outAlpha = particleAlpha + baseColor.a * (1.0 - particleAlpha);
  let outRgb = particlePremul + baseColor.rgb * (1.0 - particleAlpha);
  return vec4f(outRgb, outAlpha);
}
`;
    frame.state.module = device.createShaderModule({ code: wgsl });
    frame.state.pipeline = null;
    frame.state.pipelineFormat = null;
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
    ]);
    frame.state.quad.unmap();
    frame.state.uniformBuf = device.createBuffer({
        size: 288,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    frame.state.sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });
    frame.state.placeholder = device.createTexture({
        size: [1, 1, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: frame.state.placeholder }, new Uint8Array([0, 0, 0, 0]), { bytesPerRow: 4 }, { width: 1, height: 1, depthOrArrayLayers: 1 });
}
export function render(device, frame) {
    if (frame.input == null) {
        return;
    }
    var params = frame.params || {};
    function finiteNumber(value, fallback) {
        var num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function numberParam(name, fallback) {
        return finiteNumber(params[name], fallback);
    }
    function boolParam(name, fallback) {
        if (typeof params[name] === 'boolean')
            return params[name] ? 1 : 0;
        return fallback ? 1 : 0;
    }
    function selectParam(name, count, fallbackIndex) {
        // A select is a numeric dropdown: params[name] is the chosen option's index.
        var index = Math.round(Number(params[name]));
        return Number.isFinite(index) && index >= 0 && index < count ? index : fallbackIndex;
    }
    function colorParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.r, fallback[0]),
            finiteNumber(value.g, fallback[1]),
            finiteNumber(value.b, fallback[2]),
            finiteNumber(value.a, fallback[3]),
        ];
    }
    function pointParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
        ];
    }
    function pointRadiusParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            finiteNumber(value.radius, fallback[2]),
        ];
    }
    function pointPointLineParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            finiteNumber(value.x2, fallback[2]),
            finiteNumber(value.y2, fallback[3]),
        ];
    }
    function pointAngleRadiusParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            finiteNumber(value.radius, fallback[2]),
            finiteNumber(value.angle, fallback[3]),
        ];
    }
    function colorPointParam(name, fallback) {
        var value = params[name] || {};
        var color = value.color || {};
        return [
            finiteNumber(value.x, fallback[0]),
            finiteNumber(value.y, fallback[1]),
            0,
            0,
            finiteNumber(color.r, fallback[2]),
            finiteNumber(color.g, fallback[3]),
            finiteNumber(color.b, fallback[4]),
            finiteNumber(color.a, fallback[5]),
        ];
    }
    function gradientParam(name, fallback) {
        var value = params[name] || {};
        var stops = Array.isArray(value.stops) && value.stops.length > 0 ? value.stops : fallback;
        // Layout: 8 stop colors (rgba), then 8 positions packed 4-per-vec4, then the live count.
        var out = new Array(44).fill(0);
        var count = Math.min(stops.length, 8);
        for (var i = 0; i < count; i++) {
            var stop = stops[i] || {};
            var color = stop.color || {};
            out[i * 4] = finiteNumber(color.r, 0);
            out[i * 4 + 1] = finiteNumber(color.g, 0);
            out[i * 4 + 2] = finiteNumber(color.b, 0);
            out[i * 4 + 3] = finiteNumber(color.a, 1);
            out[32 + i] = finiteNumber(stop.position, 0);
        }
        out[40] = count;
        return out;
    }
    var output = frame.output || {};
    var width = Math.max(1, finiteNumber(output.width, 1));
    var height = Math.max(1, finiteNumber(output.height, 1));
    var time = finiteNumber(frame.time, 0);
    var inputWidth = width;
    var inputHeight = height;
    var mousePosition = frame.mousePosition || {};
    var mouseX = finiteNumber(mousePosition.x, -1);
    var mouseY = finiteNumber(mousePosition.y, -1);
    device.queue.writeBuffer(frame.state.uniformBuf, 0, new Float32Array([
        time, width, height, 0,
        inputWidth, inputHeight, 0, 0,
        mouseX, mouseY, mouseX / width, mouseY / height,
        selectParam("pointerMode", 2, 0), 0, 0, 0,
        numberParam("interactionStrength", 0.75), 0, 0, 0,
        numberParam("interactionRadius", 24), 0, 0, 0,
        numberParam("interactionFalloff", 1.6), 0, 0, 0,
        ...pointRadiusParam("particleRegion", [50, 50, 70]), 0,
        numberParam("density", 1), 0, 0, 0,
        numberParam("particleCount", 72), 0, 0, 0,
        numberParam("particleSize", 8), 0, 0, 0,
        numberParam("glowIntensity", 1.2), 0, 0, 0,
        numberParam("particleSpeed", 0.65), 0, 0, 0,
        numberParam("drift", 0.55), 0, 0, 0,
        numberParam("trails", 0.35), 0, 0, 0,
        boolParam("sourceSampling", true), 0, 0, 0,
        ...colorParam("particleColor", [0.35, 0.8, 1, 1]),
        ...colorParam("accentColor", [0.85, 0.45, 1, 1]),
    ]));
    var inputView = frame.input.createView();
    var outputFormat = frame.output.format;
    if (frame.state.pipeline == null || frame.state.pipelineFormat !== outputFormat) {
        frame.state.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: frame.state.module,
                entryPoint: 'vs_main',
                buffers: [{
                        arrayStride: 16,
                        attributes: [
                            { shaderLocation: 0, format: 'float32x2', offset: 0 },
                            { shaderLocation: 1, format: 'float32x2', offset: 8 },
                        ],
                    }],
            },
            fragment: {
                module: frame.state.module,
                entryPoint: 'fs_main',
                targets: [{ format: outputFormat }],
            },
            primitive: { topology: 'triangle-list' },
        });
        frame.state.pipelineFormat = outputFormat;
    }
    var bindGroup = device.createBindGroup({
        layout: frame.state.pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: frame.state.uniformBuf } },
            { binding: 1, resource: frame.state.sampler },
            { binding: 2, resource: inputView },
        ],
    });
    var encoder = device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.output.createView(),
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: 'store',
            }],
    });
    pass.setPipeline(frame.state.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, frame.state.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

export const manifest = {
  version: 2,
  name: "Interactive glowing particles",
  isAnimated: true,
  usesMouse: true
};
