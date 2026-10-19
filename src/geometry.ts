// keeps near parallel edge pairs from producing a degenerate cross product axis that falsely separates
const PARALLEL_EPSILON = 1e-6;

// separating axis test between two oriented boxes. inflate grows the first box on every side
export function boxesOverlap(a: CFrame, aSize: Vector3, b: CFrame, bSize: Vector3, inflate = 0): boolean {
	const [ax, ay, az, a00, a01, a02, a10, a11, a12, a20, a21, a22] = a.GetComponents();
	const [bx, by, bz, b00, b01, b02, b10, b11, b12, b20, b21, b22] = b.GetComponents();

	const ea0 = aSize.X / 2 + inflate;
	const ea1 = aSize.Y / 2 + inflate;
	const ea2 = aSize.Z / 2 + inflate;
	const eb0 = bSize.X / 2;
	const eb1 = bSize.Y / 2;
	const eb2 = bSize.Z / 2;

	// box axes are the rotation matrix columns, rij = dot(a axis i, b axis j)
	const r00 = a00 * b00 + a10 * b10 + a20 * b20;
	const r01 = a00 * b01 + a10 * b11 + a20 * b21;
	const r02 = a00 * b02 + a10 * b12 + a20 * b22;
	const r10 = a01 * b00 + a11 * b10 + a21 * b20;
	const r11 = a01 * b01 + a11 * b11 + a21 * b21;
	const r12 = a01 * b02 + a11 * b12 + a21 * b22;
	const r20 = a02 * b00 + a12 * b10 + a22 * b20;
	const r21 = a02 * b01 + a12 * b11 + a22 * b21;
	const r22 = a02 * b02 + a12 * b12 + a22 * b22;

	const dx = bx - ax;
	const dy = by - ay;
	const dz = bz - az;
	const t0 = dx * a00 + dy * a10 + dz * a20;
	const t1 = dx * a01 + dy * a11 + dz * a21;
	const t2 = dx * a02 + dy * a12 + dz * a22;

	const ar00 = math.abs(r00) + PARALLEL_EPSILON;
	const ar01 = math.abs(r01) + PARALLEL_EPSILON;
	const ar02 = math.abs(r02) + PARALLEL_EPSILON;
	const ar10 = math.abs(r10) + PARALLEL_EPSILON;
	const ar11 = math.abs(r11) + PARALLEL_EPSILON;
	const ar12 = math.abs(r12) + PARALLEL_EPSILON;
	const ar20 = math.abs(r20) + PARALLEL_EPSILON;
	const ar21 = math.abs(r21) + PARALLEL_EPSILON;
	const ar22 = math.abs(r22) + PARALLEL_EPSILON;

	if (math.abs(t0) > ea0 + eb0 * ar00 + eb1 * ar01 + eb2 * ar02) return false;
	if (math.abs(t1) > ea1 + eb0 * ar10 + eb1 * ar11 + eb2 * ar12) return false;
	if (math.abs(t2) > ea2 + eb0 * ar20 + eb1 * ar21 + eb2 * ar22) return false;

	if (math.abs(t0 * r00 + t1 * r10 + t2 * r20) > ea0 * ar00 + ea1 * ar10 + ea2 * ar20 + eb0) return false;
	if (math.abs(t0 * r01 + t1 * r11 + t2 * r21) > ea0 * ar01 + ea1 * ar11 + ea2 * ar21 + eb1) return false;
	if (math.abs(t0 * r02 + t1 * r12 + t2 * r22) > ea0 * ar02 + ea1 * ar12 + ea2 * ar22 + eb2) return false;

	if (math.abs(t2 * r10 - t1 * r20) > ea1 * ar20 + ea2 * ar10 + eb1 * ar02 + eb2 * ar01) return false;
	if (math.abs(t2 * r11 - t1 * r21) > ea1 * ar21 + ea2 * ar11 + eb0 * ar02 + eb2 * ar00) return false;
	if (math.abs(t2 * r12 - t1 * r22) > ea1 * ar22 + ea2 * ar12 + eb0 * ar01 + eb1 * ar00) return false;
	if (math.abs(t0 * r20 - t2 * r00) > ea0 * ar20 + ea2 * ar00 + eb1 * ar12 + eb2 * ar11) return false;
	if (math.abs(t0 * r21 - t2 * r01) > ea0 * ar21 + ea2 * ar01 + eb0 * ar12 + eb2 * ar10) return false;
	if (math.abs(t0 * r22 - t2 * r02) > ea0 * ar22 + ea2 * ar02 + eb0 * ar11 + eb1 * ar10) return false;
	if (math.abs(t1 * r00 - t0 * r10) > ea0 * ar10 + ea1 * ar00 + eb1 * ar22 + eb2 * ar21) return false;
	if (math.abs(t1 * r01 - t0 * r11) > ea0 * ar11 + ea1 * ar01 + eb0 * ar22 + eb2 * ar20) return false;
	if (math.abs(t1 * r02 - t0 * r12) > ea0 * ar12 + ea1 * ar02 + eb0 * ar21 + eb1 * ar20) return false;

	return true;
}

export function sphereOverlapsBox(center: Vector3, radius: number, box: CFrame, size: Vector3): boolean {
	const relative = box.PointToObjectSpace(center);
	const halfX = size.X / 2;
	const halfY = size.Y / 2;
	const halfZ = size.Z / 2;

	const outsideX = relative.X - math.clamp(relative.X, -halfX, halfX);
	const outsideY = relative.Y - math.clamp(relative.Y, -halfY, halfY);
	const outsideZ = relative.Z - math.clamp(relative.Z, -halfZ, halfZ);

	return outsideX * outsideX + outsideY * outsideY + outsideZ * outsideZ <= radius * radius;
}
