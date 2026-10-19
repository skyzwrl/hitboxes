export class PoseHistory {
	private readonly times = new Array<number>();
	private readonly poses = new Array<CFrame>();
	private oldest = 0;
	private count = 0;

	public constructor(private readonly capacity: number) {
		if (!(capacity >= 2)) {
			throw `pose history needs room for at least 2 samples, got ${capacity}`;
		}
	}

	public push(time: number, pose: CFrame): void {
		if (this.count > 0) {
			const newest = this.slot(this.count - 1);
			const newestTime = this.times[newest];
			// a clock correction can step time backwards for a frame, dropping that sample keeps the
			// buffer sorted for the binary search
			if (time < newestTime) {
				return;
			} else if (time === newestTime) {
				this.poses[newest] = pose;
				return;
			}
		}

		if (this.count < this.capacity) {
			const slot = this.slot(this.count);
			this.times[slot] = time;
			this.poses[slot] = pose;
			this.count += 1;
		} else {
			this.times[this.oldest] = time;
			this.poses[this.oldest] = pose;
			this.oldest = (this.oldest + 1) % this.capacity;
		}
	}

	// interpolated pose at time, undefined outside the recorded window (never extrapolates)
	public sample(time: number): CFrame | undefined {
		if (this.count === 0) {
			return undefined;
		}

		const last = this.count - 1;
		if (time < this.timeAt(0) || time > this.timeAt(last)) {
			return undefined;
		}

		// last sample at or before time
		let low = 0;
		let high = last;
		while (low < high) {
			const middle = math.ceil((low + high) / 2);
			if (this.timeAt(middle) <= time) {
				low = middle;
			} else {
				high = middle - 1;
			}
		}

		const before = this.slot(low);
		const beforeTime = this.times[before];
		if (beforeTime === time || low === last) {
			return this.poses[before];
		}

		const after = this.slot(low + 1);
		return this.poses[before].Lerp(this.poses[after], (time - beforeTime) / (this.times[after] - beforeTime));
	}

	// like sample, but times outside the window snap to the nearest end
	public sampleClamped(time: number): CFrame | undefined {
		if (this.count === 0) {
			return undefined;
		}
		return this.sample(math.clamp(time, this.timeAt(0), this.timeAt(this.count - 1)));
	}

	public latest(): CFrame | undefined {
		return this.count > 0 ? this.poses[this.slot(this.count - 1)] : undefined;
	}

	public newestTime(): number | undefined {
		return this.count > 0 ? this.timeAt(this.count - 1) : undefined;
	}

	public oldestTime(): number | undefined {
		return this.count > 0 ? this.timeAt(0) : undefined;
	}

	public size(): number {
		return this.count;
	}

	public clear(): void {
		this.times.clear();
		this.poses.clear();
		this.oldest = 0;
		this.count = 0;
	}

	private slot(index: number): number {
		return (this.oldest + index) % this.capacity;
	}

	private timeAt(index: number): number {
		return this.times[this.slot(index)];
	}
}
