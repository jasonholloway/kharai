
export const $root = Symbol('root');
export type $Root = typeof $root;


export const $data = Symbol('data')
export type $Data = typeof $data;

export const $space = Symbol('space')
export type $Space = typeof $space;

export const $handler = Symbol('handler')
export type $Handler = typeof $handler;

export const $fac = Symbol('fac')
export type $Fac = typeof $fac;


export type Handler = (x: any, d: any) => Promise<any>;
export type Fac = (x:any) => any;

