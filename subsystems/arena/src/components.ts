import { component, type Component, type Id } from "@f0rbit/forge";

export type Vec2 = { x: number; y: number };
export type Health = { current: number; max: number };
export type Hitbox = { radius: number };
export type Weapon = {
	melee_cooldown: number;
	ranged_cooldown: number;
	melee_ready_in: number;
	ranged_ready_in: number;
};
export type Swing = {
	owner_id: Id;
	dir: Vec2;
	arc_radians: number;
	radius: number;
};
export type Projectile = {
	owner_id: Id;
	speed: number;
	radius: number;
};
export type Flash = {
	ticks_remaining: number;
	original_tint: number;
};
export type Lifetime = { ticks_remaining: number };

export const floor_c: Component<true> = component<true>("ar.floor");
export const wall_c: Component<true> = component<true>("ar.wall");
export const player_c: Component<true> = component<true>("ar.player");
export const dummy_c: Component<true> = component<true>("ar.dummy");
export const chaser_c: Component<true> = component<true>("ar.chaser");
export const projectile_c: Component<Projectile> = component<Projectile>("ar.projectile");
export const weapon_c: Component<Weapon> = component<Weapon>("ar.weapon");
export const health_c: Component<Health> = component<Health>("ar.health");
export const hitbox_c: Component<Hitbox> = component<Hitbox>("ar.hitbox");
export const vel_c: Component<Vec2> = component<Vec2>("ar.vel");
export const dir_vec_c: Component<Vec2> = component<Vec2>("ar.dir_vec");
export const flash_c: Component<Flash> = component<Flash>("ar.flash");
export const swing_c: Component<Swing> = component<Swing>("ar.swing");
export const lifetime_c: Component<Lifetime> = component<Lifetime>("ar.lifetime");
