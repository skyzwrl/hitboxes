/// <reference types="@rbxts/testez/globals" />

import { HitboxClient, HitboxClientOptions } from "../client";
import { HitClaim } from "../messages";
import { HitboxServerOptions } from "../server";
import { box } from "../shapes";
import { defineSwing, phase } from "../swing";
import { Arena, JAB, moveTo } from "./fixtures";

function duel(clientOverrides: Partial<HitboxClientOptions> = {}, serverOverrides: Partial<HitboxServerOptions> = {}) {
	const arena = new Arena(serverOverrides);
	const events = new Array<string>();
	const claims = new Array<HitClaim>();
	arena.loopback.server.onClaim((_, claim) => claims.push(claim));

	const client = new HitboxClient({
		swings: { jab: JAB },
		transport: arena.loopback.client(arena.player),
		clock: () => arena.now,
		frame: arena.frame,
		root: () => arena.attacker.PrimaryPart?.CFrame,
		targets: () => [arena.target],
		onHit: (target, swing) => events.push(`hit ${target.Name} ${swing}`),
		onConfirm: (target, swing) => events.push(`confirm ${target.Name} ${swing}`),
		onUndo: (target, swing, reason) => events.push(`undo ${target.Name} ${swing} ${reason}`),
		onSwingRejected: (swing, reason) => events.push(`rejected ${swing} ${reason}`),
		...clientOverrides,
	});

	return { arena, client, events, claims };
}

export = () => {
	describe("prediction", () => {
		it("hits the moment the shape touches, before the server hears about it", () => {
			const { arena, client, events, claims } = duel();

			arena.advance(0);
			expect(client.swing("jab")).to.be.ok();
			arena.advance(0.05);
			expect(events.size()).to.equal(0);

			arena.advance(0.05);
			expect(events.join("|")).to.equal("hit Target jab");
			expect(claims.size()).to.equal(0);

			arena.loopback.flush();
			expect(claims.size()).to.equal(1);
			expect(claims[0].phase).to.equal(0);
			expect(claims[0].time >= 0.05 && claims[0].time <= 0.1).to.equal(true);
		});

		it("claims a target once per swing", () => {
			const { arena, client, events, claims } = duel();

			arena.advance(0);
			client.swing("jab");
			for (let frame = 0; frame < 12; frame++) {
				arena.advance(1 / 30);
				arena.loopback.flush();
			}

			expect(claims.size()).to.equal(1);
			expect(events.join("|")).to.equal("hit Target jab|confirm Target jab");
		});

		it("catches a window shorter than a frame", () => {
			const flick = defineSwing({
				duration: 0.5,
				phases: [phase(box(new Vector3(4, 4, 4), new CFrame(0, 0, -3)), 0.1, 0.11)],
			});
			const { arena, client, claims, events } = duel({ swings: { flick } }, { swings: { flick } });

			arena.advance(0);
			client.swing("flick");
			arena.advance(0.05);
			arena.advance(0.1);
			arena.loopback.flush();

			expect(claims.size()).to.equal(1);
			expect(claims[0].time >= 0.1 && claims[0].time <= 0.11).to.equal(true);
			expect(events.join("|")).to.equal("hit Target flick|confirm Target flick");
		});
	});

	describe("reconciliation", () => {
		it("confirms hits the server agrees with", () => {
			const { arena, client, events } = duel();

			arena.advance(0);
			client.swing("jab");
			arena.advance(0.1);
			arena.loopback.flush();

			expect(events.join("|")).to.equal("hit Target jab|confirm Target jab");
			expect(arena.hits.size()).to.equal(1);
		});

		it("undoes hits the server disagrees with", () => {
			const rendered = new CFrame(0, 0, -4);
			const { arena, client, events } = duel({ poseOf: () => rendered });
			moveTo(arena.target, new CFrame(0, 0, -9));

			arena.advance(0);
			client.swing("jab");
			arena.advance(0.1);
			arena.loopback.flush();

			expect(events.join("|")).to.equal("hit Target jab|undo Target jab NoOverlap");
			expect(arena.hits.size()).to.equal(0);
		});

		it("undoes everything and stops when the server refuses the swing", () => {
			const { arena, client, events } = duel({ swings: { jab: JAB, secret: JAB } });

			arena.advance(0);
			client.swing("secret");
			arena.advance(0.1);
			expect(client.isSwinging()).to.equal(true);
			arena.loopback.flush();

			expect(events.join("|")).to.equal(
				"hit Target secret|undo Target secret UnknownSwing|rejected secret UnknownSwing",
			);
			expect(client.isSwinging()).to.equal(false);
		});
	});

	describe("swing lifecycle", () => {
		it("won't start a swing while one is playing", () => {
			const { arena, client } = duel();

			arena.advance(0);
			const first = client.swing("jab");
			expect(client.swing("jab")).never.to.be.ok();

			for (let frame = 0; frame < 6; frame++) {
				arena.advance(0.1);
			}
			const second = client.swing("jab");
			expect(second).to.be.ok();
			expect(second! > first!).to.equal(true);
		});

		it("throws for swings it doesn't know", () => {
			const { client } = duel();
			expect(() => client.swing("roundhouse")).to.throw("unknown swing");
		});

		it("stops when the character goes away", () => {
			let alive = true;
			const { arena, client, events } = duel({
				root: () => (alive ? new CFrame() : undefined),
			});

			arena.advance(0);
			client.swing("jab");
			alive = false;
			arena.advance(0.1);

			expect(client.isSwinging()).to.equal(false);
			expect(events.size()).to.equal(0);
		});

		it("disconnects from the frame and transport on destroy", () => {
			const { arena, client, events } = duel();

			arena.advance(0);
			client.swing("jab");
			client.destroy();
			arena.advance(0.1);
			arena.loopback.flush();

			expect(arena.frame.listenerCount()).to.equal(1);
			expect(events.size()).to.equal(0);
		});
	});
};
