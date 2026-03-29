/**
 * Maps Smart Engine chain_snapshot (0–1 processor slots) to a Web Audio node graph
 * for in-browser playback — no extra server render pass.
 */

const irBufferByCtx = new WeakMap();

export function parseChainSnapshot(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && Array.isArray(raw.processors)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return Array.isArray(o?.processors) ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function procVal(processors, id, fallback = 0.5) {
  if (!Array.isArray(processors)) return fallback;
  const p = processors.find((x) => x && x.id === id);
  const v = p?.value;
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, Math.min(1, v));
  return fallback;
}

function procAvg(processors, ids, fallback = 0.5) {
  if (!Array.isArray(ids) || !ids.length) return fallback;
  let s = 0;
  for (const id of ids) s += procVal(processors, id, fallback);
  return s / ids.length;
}

function makeSatCurve(amount) {
  const k = Math.max(0, Math.min(1, amount)) * 10;
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function createNoiseDecayIR(ctx, durSec = 1.65, decay = 2.35) {
  const rate = ctx.sampleRate;
  const len = Math.floor(Math.min(rate * durSec, rate * 3));
  const ir = ctx.createBuffer(2, len, rate);
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      peak = Math.max(peak, Math.abs(d[i]));
    }
  }
  if (peak > 0) {
    const norm = 0.22 / peak;
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] *= norm;
    }
  }
  return ir;
}

function getReverbIR(ctx) {
  let buf = irBufferByCtx.get(ctx);
  if (!buf) {
    buf = createNoiseDecayIR(ctx);
    irBufferByCtx.set(ctx, buf);
  }
  return buf;
}

export function chainHasSmartPlayback(chain) {
  return Array.isArray(chain?.processors) && chain.processors.length >= 6;
}

/**
 * @param {object} opts
 * @param {AudioContext} opts.ctx
 * @param {AudioBufferSourceNode} opts.source
 * @param {AudioNode} opts.masterIn
 * @param {{ processors: Array<{ id: string, value?: number }> }} opts.chainSnapshot
 * @param {number} opts.eqLow 0–1 UI center 0.5
 * @param {number} opts.eqMid
 * @param {number} opts.eqHigh
 * @param {number} opts.pan -1..1
 * @param {number} opts.volume 0–1
 * @param {boolean} opts.muted
 * @returns {AudioNode[]} all nodes to disconnect on teardown (includes source)
 */
export function connectSmartVocalPlayback({
  ctx,
  source,
  masterIn,
  chainSnapshot,
  eqLow,
  eqMid,
  eqHigh,
  pan,
  volume,
  muted,
}) {
  const processors = chainSnapshot?.processors;
  const v = (id, fb) => procVal(processors, id, fb);
  const nodes = [];

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 62 + v('eq', 0.48) * 135;
  hp.Q.value = 0.71;
  nodes.push(hp);

  const deess = ctx.createBiquadFilter();
  deess.type = 'peaking';
  deess.frequency.value = 7000;
  deess.Q.value = 0.88;
  deess.gain.value = -16 * Math.pow(v('deess', 0.42), 1.12);
  nodes.push(deess);

  const c1 = ctx.createDynamicsCompressor();
  c1.threshold.value = -40 - v('comp1', 0.5) * 20;
  c1.knee.value = 8;
  c1.ratio.value = 4 + v('comp1', 0.5) * 11;
  c1.attack.value = 0.003;
  c1.release.value = 0.11;
  nodes.push(c1);

  const c2 = ctx.createDynamicsCompressor();
  c2.threshold.value = -30 - v('comp2', 0.5) * 14;
  c2.knee.value = 16;
  c2.ratio.value = 2.2 + v('comp2', 0.5) * 5.5;
  c2.attack.value = 0.022;
  c2.release.value = 0.3;
  nodes.push(c2);

  const air = ctx.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 9800;
  air.gain.value = v('air', 0.38) * 8;
  nodes.push(air);

  const sat = ctx.createWaveShaper();
  sat.curve = makeSatCurve(v('sat', 0.22));
  try {
    sat.oversample = '2x';
  } catch (_) {}
  nodes.push(sat);

  const verbW = v('verb', 0.32);
  const delW = v('delay', 0.28);
  const widthAmt = v('width', 0.35);

  const dryGn = ctx.createGain();
  dryGn.gain.value = Math.max(0.36, 1 - verbW * 0.44 - delW * 0.34);
  nodes.push(dryGn);

  const delayNode = ctx.createDelay(1.0);
  delayNode.delayTime.value = 0.052 + delW * 0.34;
  const dFb = ctx.createGain();
  dFb.gain.value = Math.min(0.48, delW * 0.46);
  const dWet = ctx.createGain();
  dWet.gain.value = delW * 0.5 + widthAmt * 0.09;
  nodes.push(delayNode, dFb, dWet);

  const conv = ctx.createConvolver();
  conv.buffer = getReverbIR(ctx);
  const rWet = ctx.createGain();
  rWet.gain.value = Math.min(0.48, verbW * (0.48 + widthAmt * 0.18));
  nodes.push(conv, rWet);

  const sum = ctx.createGain();
  sum.gain.value = 0.9;
  nodes.push(sum);

  source.connect(hp);
  hp.connect(deess);
  deess.connect(c1);
  c1.connect(c2);
  c2.connect(air);
  air.connect(sat);

  sat.connect(dryGn);
  dryGn.connect(sum);

  sat.connect(delayNode);
  delayNode.connect(dWet);
  dWet.connect(sum);
  delayNode.connect(dFb);
  dFb.connect(delayNode);

  sat.connect(conv);
  conv.connect(rWet);
  rWet.connect(sum);

  const mShelf = ctx.createBiquadFilter();
  mShelf.type = 'highshelf';
  mShelf.frequency.value = 11200;
  mShelf.gain.value = procAvg(processors, ['mstr_exc', 'mstr_tone', 'mstr_ss'], 0.45) * 2.4;
  nodes.push(mShelf);

  const mGlue = procAvg(processors, ['mstr_glue', 'mstr_ceiling', 'mstr_warm', 'mstr_space'], 0.5);
  const mComp = ctx.createDynamicsCompressor();
  mComp.threshold.value = -13 - mGlue * 11;
  mComp.knee.value = 12;
  mComp.ratio.value = 5.5 + mGlue * 9;
  mComp.attack.value = 0.002;
  mComp.release.value = 0.24;
  nodes.push(mComp);

  const lim = ctx.createDynamicsCompressor();
  const ceil = procVal(processors, 'mstr_ceiling', 0.55);
  const bus = v('limit', 0.55);
  lim.threshold.value = -8 - (ceil * 0.65 + bus * 0.35) * 7;
  lim.knee.value = 2;
  lim.ratio.value = 14 + bus * 6;
  lim.attack.value = 0.001;
  lim.release.value = 0.11;
  nodes.push(lim);

  sum.connect(mShelf);
  mShelf.connect(mComp);
  mComp.connect(lim);

  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 130;
  low.gain.value = (Number(eqLow) - 0.5) * 18;

  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1200;
  mid.Q.value = 0.9;
  mid.gain.value = (Number(eqMid) - 0.5) * 12;

  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 9000;
  high.gain.value = (Number(eqHigh) - 0.5) * 12;

  nodes.push(low, mid, high);

  lim.connect(low);
  low.connect(mid);
  mid.connect(high);

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));
  const gain = ctx.createGain();
  gain.gain.value = muted ? 0 : Math.max(0, Math.min(1, volume));
  nodes.push(panner, gain);

  high.connect(panner);
  panner.connect(gain);
  gain.connect(masterIn);

  return nodes;
}

export function tuneAssistDetuneCents(processors) {
  if (!Array.isArray(processors)) return 0;
  const tv = procVal(processors, 'tune', 0.5);
  return (tv - 0.5) * 40;
}
