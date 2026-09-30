export interface GeometryOptions { id:string;producer:string;observedAt:string;elementIds:string[];pairs?:{id:string;first:string;second:string;allowOverlap:boolean}[];tolerancePx?:number; }
export interface GeometryCase {id:string;producer:string;observedAt:string;required:string[];viewport:{width:number;height:number};document:{scrollWidth:number};rectangles:{id:string;x:number;y:number;width:number;height:number;visible:boolean}[];pairs?:GeometryOptions['pairs'];tolerancePx?:number;}
export function captureGeometry(page:{evaluate:Function},options:GeometryOptions):Promise<GeometryCase>;
