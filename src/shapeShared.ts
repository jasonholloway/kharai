
export const $self = Symbol('self');
export type $Self = typeof $self;

export const $data = Symbol('data')
export type $Data = typeof $data;

export const $root = Symbol('root')
export type $Root = typeof $root;

export const $space = Symbol('space')
export type $Space = typeof $space;

export const $handler = Symbol('handler')
export type $Handler = typeof $handler;

export const $fac = Symbol('fac')
export type $Fac = typeof $fac;

export const $incl = Symbol('incl')
export type $Incl = typeof $incl;


export type Handler = (x: any, d: any) => Promise<unknown>;
export type Projector = (d: unknown) => unknown[];
export type Fac = (x:any) => unknown;

