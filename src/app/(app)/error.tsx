"use client";
export default function AppError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){return <section className="empty-card"><h2>Workspace data could not be loaded</h2><p>{error.message||"Something went wrong while loading this page."}</p><button className="button" onClick={reset}>Try again</button></section>}
