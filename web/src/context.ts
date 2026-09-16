import { createContext, useContext } from "react";
export const Ctx = createContext<any>(null);
export const useApp = () => useContext(Ctx);
