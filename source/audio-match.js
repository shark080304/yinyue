(() => {
  'use strict';

  const sampleRate = 11025;
  const fftSize = 2048;
  const hopSize = 512;
  const bands = 40;
  const deltaDistance = 3;
  const maximumQuerySeconds = 20;
  const maximumReferenceSeconds = 120;
  const frameSeconds = hopSize / sampleRate;
  const window = Float32Array.from({ length: fftSize }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (fftSize - 1)));
  const bandEdges = Float32Array.from({ length: bands + 2 }, (_, i) => 85 * (4900 / 85) ** (i / (bands + 1)));

  function cancelled(signal) {
    if (signal?.aborted) throw new DOMException('Audio matching was cancelled', 'AbortError');
  }

  function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function transform(real, imaginary) {
    for (let i = 1, j = 0; i < fftSize; i++) {
      let bit = fftSize >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const value = real[i];
        real[i] = real[j];
        real[j] = value;
      }
    }
    for (let length = 2; length <= fftSize; length *= 2) {
      const angle = -2 * Math.PI / length;
      const stepReal = Math.cos(angle);
      const stepImaginary = Math.sin(angle);
      for (let start = 0; start < fftSize; start += length) {
        let twiddleReal = 1;
        let twiddleImaginary = 0;
        for (let i = 0; i < length / 2; i++) {
          const left = start + i;
          const right = left + length / 2;
          const rightReal = real[right] * twiddleReal - imaginary[right] * twiddleImaginary;
          const rightImaginary = real[right] * twiddleImaginary + imaginary[right] * twiddleReal;
          real[right] = real[left] - rightReal;
          imaginary[right] = imaginary[left] - rightImaginary;
          real[left] += rightReal;
          imaginary[left] += rightImaginary;
          const next = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
          twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
          twiddleReal = next;
        }
      }
    }
  }

  function normalize(vector, removeMean) {
    const mean = removeMean ? vector.reduce((sum, value) => sum + value, 0) / vector.length : 0;
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      vector[i] -= mean;
      norm += vector[i] * vector[i];
    }
    const scale = Math.sqrt(norm) || 1;
    for (let i = 0; i < vector.length; i++) vector[i] /= scale;
    return vector;
  }

  function bandPowers(real, imaginary) {
    const powers = new Float32Array(bands);
    for (let bin = 1; bin < fftSize / 2; bin++) {
      const frequency = bin * sampleRate / fftSize;
      if (frequency < bandEdges[0] || frequency > bandEdges[bands + 1]) continue;
      const power = real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
      for (let band = 0; band < bands; band++) {
        if (frequency < bandEdges[band] || frequency > bandEdges[band + 2]) continue;
        const center = bandEdges[band + 1];
        const weight = frequency <= center
          ? (frequency - bandEdges[band]) / (center - bandEdges[band])
          : (bandEdges[band + 2] - frequency) / (bandEdges[band + 2] - center);
        powers[band] += power * weight;
      }
    }
    return powers;
  }

  async function monoSamples(buffer, limit, signal) {
    cancelled(signal);
    const duration = Math.min(buffer.duration, limit);
    const context = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    const rendered = await context.startRendering();
    cancelled(signal);
    return rendered.getChannelData(0);
  }

  async function fingerprint(buffer, limit, signal) {
    const samples = await monoSamples(buffer, limit, signal);
    const frames = [];
    const real = new Float32Array(fftSize);
    const imaginary = new Float32Array(fftSize);
    let sumEnergy = 0;
    for (let start = 0; start + fftSize <= samples.length; start += hopSize) {
      imaginary.fill(0);
      let energy = 0;
      for (let i = 0; i < fftSize; i++) {
        const value = samples[start + i];
        real[i] = value * window[i];
        energy += value * value;
      }
      sumEnergy += energy / fftSize;
      transform(real, imaginary);
      const logs = bandPowers(real, imaginary).map((value) => Math.log(1e-9 + value));
      const shape = normalize(logs.slice(), true);
      const delta = new Float32Array(bands);
      const past = frames[frames.length - deltaDistance];
      if (past) {
        for (let band = 0; band < bands; band++) delta[band] = logs[band] - past.logs[band];
        normalize(delta, true);
      }
      frames.push({ shape, delta, logs, energy: energy / fftSize });
      if (frames.length % 128 === 0) {
        cancelled(signal);
        await yieldToBrowser();
      }
    }
    return { frames, rms: Math.sqrt(sumEnergy / Math.max(1, frames.length)) };
  }

  function cosine(left, right) {
    let sum = 0;
    for (let i = 0; i < bands; i++) sum += left[i] * right[i];
    return sum;
  }

  async function compare(query, reference, signal) {
    const first = deltaDistance + 1;
    const last = query.frames.length - 1;
    const queryLength = last - first;
    if (queryLength <= 0 || reference.frames.length < query.frames.length) return { score: 0, offset: 0 };
    let best = -1;
    let bestFrame = 0;
    for (let offset = 0; offset <= reference.frames.length - query.frames.length; offset++) {
      let sum = 0;
      let included = 0;
      for (let i = first; i < last; i += 2) {
        const left = query.frames[i];
        const right = reference.frames[offset + i];
        if (left.energy < 1e-7 || right.energy < 1e-7) continue;
        sum += .46 * cosine(left.shape, right.shape) + .54 * cosine(left.delta, right.delta);
        included++;
      }
      const score = included >= queryLength / 4 ? sum / included : 0;
      if (score > best) {
        best = score;
        bestFrame = offset;
      }
      if (offset % 128 === 0) {
        cancelled(signal);
        await yieldToBrowser();
      }
    }
    return { score: best, offset: bestFrame * frameSeconds };
  }

  function create({ tracks, onProgress } = {}) {
    if (!Array.isArray(tracks) || !tracks.length ||
        tracks.some((track) => !track.id || !track.url || !track.title)) {
      throw new TypeError('Supply tracks with id, title, and url.');
    }
    const prepared = new Map();
    let decoder;
    let disposed = false;

    async function decode(input, signal) {
      cancelled(signal);
      if (disposed) throw new Error('This audio matcher is closed.');
      if (input && typeof input.getChannelData === 'function') return input;
      if (input instanceof Blob && input.size > 30 * 1024 * 1024) throw new Error('Audio files must be smaller than 30 MB.');
      if (!decoder) decoder = new AudioContext();
      const data = input instanceof Blob ? await input.arrayBuffer() : input;
      if (!(data instanceof ArrayBuffer)) throw new TypeError('Choose an audio File, Blob, ArrayBuffer, or AudioBuffer.');
      if (data.byteLength > 30 * 1024 * 1024) throw new Error('Audio files must be smaller than 30 MB.');
      const buffer = await decoder.decodeAudioData(data.slice(0));
      cancelled(signal);
      return buffer;
    }

    async function prepare(track, signal) {
      if (prepared.has(track.id)) return prepared.get(track.id);
      const response = await fetch(track.url, { signal });
      if (!response.ok) throw new Error('A reference song could not be loaded.');
      const buffer = await decode(await response.arrayBuffer(), signal);
      const result = await fingerprint(buffer, maximumReferenceSeconds, signal);
      prepared.set(track.id, result);
      return result;
    }

    async function identify(input, { signal } = {}) {
      const buffer = await decode(input, signal);
      if (buffer.duration < 6) return { matched: false, id: null, title: null, offset: null, confidence: 0, reason: 'too-short', candidates: [] };
      onProgress?.({ phase: 'query' });
      const query = await fingerprint(buffer, maximumQuerySeconds, signal);
      if (query.rms < .0007) return { matched: false, id: null, title: null, offset: null, confidence: 0, reason: 'silence', candidates: [] };
      const candidates = [];
      for (const [index, track] of tracks.entries()) {
        cancelled(signal);
        onProgress?.({ phase: 'reference', index, total: tracks.length, title: track.title });
        const reference = await prepare(track, signal);
        const score = await compare(query, reference, signal);
        candidates.push({ id: track.id, title: track.title, score: Math.max(0, score.score), offset: Number(score.offset.toFixed(2)) });
      }
      candidates.sort((left, right) => right.score - left.score);
      const best = candidates[0];
      const margin = best.score - (candidates[1]?.score ?? 0);
      const matched = best.score >= .72 && margin >= .075;
      const confidence = matched ? Math.min(.99, Math.max(.5, (best.score - .5) * 1.9)) : Math.max(0, best.score - .35);
      return {
        matched,
        id: matched ? best.id : null,
        title: matched ? best.title : null,
        confidence: Number(confidence.toFixed(2)),
        offset: matched ? best.offset : null,
        reason: matched ? 'match' : 'no-match',
        candidates: candidates.map((item) => ({ ...item, score: Number(item.score.toFixed(3)) })),
      };
    }

    async function dispose() {
      disposed = true;
      prepared.clear();
      await decoder?.close();
      decoder = null;
    }

    return Object.freeze({ identify, dispose });
  }

  globalThis.SunnyAudioMatch = Object.freeze({ create });
})();
