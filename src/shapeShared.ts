import { FacNode } from "./facs";

export const $root = Symbol('root');
export type $Root = typeof $root;


export type Handler = (x: any, d: any) => Promise<any>;


export type Nodes = { [p: string]: SchemaNode }

export type SchemaNode = {}
export type DataNode<D = unknown> = { data: D }
export type SpaceNode<I> = { space: I }
export type HandlerNode = { handler: Handler }
export type ContextNode<X = unknown> = { fac: FacNode<X> }

export function isDataNode(v: SchemaNode): v is DataNode<any> {
  return (<any>v).data;
}

export function isSpaceNode(v: any): v is SpaceNode<any> {
  return (<any>v).space;
}

export function isContextNode(v: any): v is ContextNode {
  return (<any>v).fac;
}

export function isHandlerNode(v: any): v is HandlerNode {
  return (<any>v).handler;
}

export function data<S>(s: S): DataNode<S> {
  return { data: s };
}

export function space<S extends { [k in keyof S]: SchemaNode }>(s: S): SpaceNode<S> {
  return { space: s };
}

export function fac<X>(x: X) {
  return { fac: x };
}

