"use client";
export function ConfirmSubmitButton({children,message}:{children:React.ReactNode;message:string}){return <button className="button danger" onClick={event=>{if(!window.confirm(message))event.preventDefault()}}>{children}</button>}
