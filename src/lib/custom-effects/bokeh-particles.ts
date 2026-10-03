// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component: unknown,
  _properties: unknown,
): void {}

export default function Effect() { }
export function setup(device, frame) {
    var wgsl = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  frameData: vec4f,
  inputDimsData: vec4f,
  phase: vec4f,
  transform: vec4f,
  density: vec4f,
  particleSize: vec4f,
  glowIntensity: vec4f,
  sizeVariation: vec4f,
  scatterRadius: vec4f,
  direction: vec4f,
  pathRandomness: vec4f,
  edge: vec4f,
  gradColors: array<vec4f, 8>,
  gradPos: vec4f,
  gradPos2: vec4f,
  gradCount: vec4f,
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

fn sampleInputOrZero(p: vec2f) -> vec4f {
  let inside = step(vec2f(0.0), p) * step(p, vec2f(1.0));
  return sampleInput(p) * (inside.x * inside.y);
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, vec3f(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2f) -> vec2f {
  return vec2f(hash21(p), hash21(p + vec2f(127.1, 311.7)));
}

fn getGradPos(idx: i32) -> f32 {
  if (idx < 4) {
    return u.gradPos[idx];
  }
  return u.gradPos2[idx - 4];
}

fn sampleGradient(t: f32) -> vec4f {
  let count = i32(u.gradCount.x);
  if (count <= 1) {
    return u.gradColors[0];
  }
  var lower = 0;
  var upper = 0;
  for (var i = 0; i < 7; i = i + 1) {
    if (i >= count - 1) { break; }
    let p0 = getGradPos(i);
    let p1 = getGradPos(i + 1);
    if (t >= p0) {
      lower = i;
      upper = i + 1;
    }
  }
  let pL = getGradPos(lower);
  let pU = getGradPos(upper);
  let range = pU - pL;
  let frac = select(0.0, clamp((t - pL) / range, 0.0, 1.0), range > 0.0001);
  return mix(u.gradColors[lower], u.gradColors[upper], frac);
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
  let texel = inputTexel;
  let aspect = inputDims.x / max(inputDims.y, 1.0);
  let phase = u.phase.x;
  let transform = u.transform;
  let density = u.density.x;
  let particleSize = u.particleSize.x;
  let glowIntensity = u.glowIntensity.x;
  let sizeVariation = u.sizeVariation.x;
  let scatterRadius = u.scatterRadius.x;
  let direction = u.direction.x;
  let pathRandomness = u.pathRandomness.x;
  let edgeParam = u.edge.x / 100.0;
  let inputColor = sampleInput(uv);
  let ph = phase / 100.0 * 6.283185307;
  let dirRad = direction * 6.283185307 / 360.0;
  let dirVec = vec2f(cos(dirRad), -sin(dirRad));
  let wobble = pathRandomness / 100.0;
  let centerUv = transform.xy / 100.0;
  let angleRad = transform.w * 6.283185307 / 360.0;
  let cosA = cos(angleRad);
  let sinA = sin(angleRad);
  let rad = transform.z / 100.0;
  let scatter = scatterRadius / 100.0 * rad;
  let maxParticles = i32(density * 2.0);
  let pSize = particleSize / 100.0 * 0.08;
  let sizeVar = sizeVariation / 100.0;
  let intensity = glowIntensity / 100.0 * 2.0;
  let p = uv * dims;
  var result = inputColor;
  for (var i = 0; i < 200; i = i + 1) {
    if (i >= maxParticles) { break; }
    let fi = f32(i);
    let seed = vec2f(fi * 0.7123, fi * 1.3217);
    let rnd = hash22(seed);
    let baseAngle = hash21(seed + vec2f(53.1, 97.3)) * 6.283185307;
    let baseR = rnd.y * scatter;
    let baseUv = centerUv + vec2f(cos(baseAngle) * baseR, sin(baseAngle) * baseR / aspect);
    let phaseOffset = hash21(seed + vec2f(17.0, 31.0));
    let travelPhase = fract((ph / 6.283185307) + phaseOffset);
    let drift = (travelPhase - 0.5) * scatter * 2.0;
    let driftVec = vec2f(dirVec.x * drift, dirVec.y * drift / aspect);
    let wobbleOffset = wobble * vec2f(
      hash21(seed + vec2f(11.0, 23.0)) * 0.4 * sin(ph * 2.0 + hash21(seed + vec2f(41.0, 59.0)) * 6.283185307)
      + hash21(seed + vec2f(13.0, 29.0)) * 0.3 * sin(ph * 3.0 + hash21(seed + vec2f(43.0, 61.0)) * 6.283185307)
      + hash21(seed + vec2f(17.0, 37.0)) * 0.2 * sin(ph * 5.0 + hash21(seed + vec2f(47.0, 67.0)) * 6.283185307),
      hash21(seed + vec2f(71.0, 83.0)) * 0.3 * sin(ph * 2.0 + hash21(seed + vec2f(73.0, 89.0)) * 6.283185307)
      + hash21(seed + vec2f(79.0, 97.0)) * 0.2 * sin(ph * 3.0 + hash21(seed + vec2f(81.0, 101.0)) * 6.283185307)
      + hash21(seed + vec2f(83.0, 107.0)) * 0.15 * sin(ph * 5.0 + hash21(seed + vec2f(87.0, 109.0)) * 6.283185307)
    ) * scatter;
    let offsetFromCenter = (baseUv - centerUv) + driftVec + wobbleOffset;
    let rotatedOffset = vec2f(
      offsetFromCenter.x * cosA - offsetFromCenter.y * sinA,
      offsetFromCenter.x * sinA + offsetFromCenter.y * cosA,
    );
    let particleUv = centerUv + rotatedOffset;
    let particlePx = particleUv * dims;
    let baseSize = pSize * dims.y * (1.0 - sizeVar * 0.8 + sizeVar * hash21(seed + vec2f(3.0, 7.0)) * 0.8);
    let dist = length(p - particlePx);
    let softGlow = exp(-dist * dist / (baseSize * baseSize + 0.001));
    let hardGlow = step(0.5, softGlow);
    let glow = mix(softGlow, hardGlow, edgeParam);
    let pulse = 0.7 + 0.3 * sin(ph * 2.0 + fi * 1.7);
    let srcSample = sampleInput(clamp(particleUv, vec2f(0.0), vec2f(1.0)));
    let lum = dot(srcSample.rgb, vec3f(0.299, 0.587, 0.114));
    let brightness = 0.3 + 0.7 * lum;
    let gradT = hash21(seed + vec2f(200.0, 300.0));
    let particleColor = sampleGradient(gradT);
    let pColor = vec3f(particleColor.r, particleColor.g, particleColor.b) * intensity * glow * pulse * brightness;
    result = vec4f(result.rgb + pColor * result.a, result.a);
  }
  return result;
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
    // 12 vec4f base + 8 grad colors + 2 grad pos + 1 grad count = 23 vec4f = 368 bytes
    frame.state.uniformBuf = device.createBuffer({
        size: 368,
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
    var params = frame.params || {};
    function finiteNumber(value, fallback) {
        var num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function numberParam(name, fallback) {
        return finiteNumber(params[name], fallback);
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
    var time = 0;
    var inputWidth = width;
    var inputHeight = height;
    var gradData = gradientParam("glowColor", [
        { position: 0, color: { r: 1, g: 0.85, b: 0.3, a: 1 } },
        { position: 0.5, color: { r: 1, g: 0.55, b: 0.1, a: 1 } },
        { position: 1, color: { r: 0.9, g: 0.3, b: 0.05, a: 1 } },
    ]);
    device.queue.writeBuffer(frame.state.uniformBuf, 0, new Float32Array([
        time, width, height, 0,
        inputWidth, inputHeight, 0, 0,
        numberParam("phase", 0), 0, 0, 0,
        ...pointAngleRadiusParam("transform", [50, 50, 50, 0]),
        numberParam("density", 50), 0, 0, 0,
        numberParam("particleSize", 30), 0, 0, 0,
        numberParam("glowIntensity", 60), 0, 0, 0,
        numberParam("sizeVariation", 50), 0, 0, 0,
        numberParam("scatterRadius", 80), 0, 0, 0,
        numberParam("direction", 0), 0, 0, 0,
        numberParam("pathRandomness", 30), 0, 0, 0,
        numberParam("edge", 0), 0, 0, 0,
        ...gradData,
    ]));
    var inputView = frame.input != null
        ? frame.input.createView()
        : frame.state.placeholder.createView();
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
defineProperties(Effect, {
    "phase": {
        type: "number",
        label: "Phase",
        defaultValue: 0,
        control: "slider",
        min: 0,
        max: 100,
        step: 0.5,
    },
    "transform": {
        type: "point-angle-radius",
        label: "Transform",
        defaultValue: { "x": 50, "y": 50, "radius": 50, "angle": 0 },
        mode: "canvas_and_ui",
        positionUnit: "%",
        radiusUnit: "%",
    },
    "density": {
        type: "number",
        label: "Density",
        defaultValue: 50,
        control: "slider",
        min: 1,
        max: 100,
        step: 1,
    },
    "particleSize": {
        type: "number",
        label: "Particle size",
        defaultValue: 30,
        control: "slider",
        min: 1,
        max: 100,
        step: 1,
    },
    "glowIntensity": {
        type: "number",
        label: "Glow intensity",
        defaultValue: 60,
        control: "slider",
        min: 0,
        max: 100,
        step: 1,
    },
    "glowColor": {
        type: "gradient",
        label: "Glow color",
        defaultValue: {
            stops: [
                { position: 0, color: { r: 1, g: 0.85, b: 0.3, a: 1 } },
                { position: 0.5, color: { r: 1, g: 0.55, b: 0.1, a: 1 } },
                { position: 1, color: { r: 0.9, g: 0.3, b: 0.05, a: 1 } },
            ],
        },
    },
    "sizeVariation": {
        type: "number",
        label: "Size variation",
        defaultValue: 50,
        control: "slider",
        min: 0,
        max: 100,
        step: 1,
    },
    "scatterRadius": {
        type: "number",
        label: "Scatter radius",
        defaultValue: 80,
        control: "slider",
        min: 0,
        max: 100,
        step: 1,
    },
    "direction": {
        type: "number",
        label: "Direction",
        defaultValue: 0,
        control: "slider",
        min: 0,
        max: 360,
        step: 1,
    },
    "pathRandomness": {
        type: "number",
        label: "Randomize",
        defaultValue: 30,
        control: "slider",
        min: 0,
        max: 100,
        step: 1,
    },
    "edge": {
        type: "number",
        label: "Edge",
        defaultValue: 0,
        control: "slider",
        min: 0,
        max: 100,
        step: 1,
    },
});

export const manifest = {
  "version": 2,
  "name": "Glowing particles",
  "isAnimated": false,
  "usesMouse": false
}

