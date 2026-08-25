const ACCESS_KEY='bhcc_reporting_access_token';
const REFRESH_KEY='bhcc_reporting_refresh_token';
export const getReportingAccessToken=()=>typeof window==='undefined'?null:window.sessionStorage.getItem(ACCESS_KEY);
export const getReportingRefreshToken=()=>typeof window==='undefined'?null:window.sessionStorage.getItem(REFRESH_KEY);
export function setReportingTokens(access:string,refresh?:string){if(typeof window==='undefined')return;window.sessionStorage.setItem(ACCESS_KEY,access);if(refresh)window.sessionStorage.setItem(REFRESH_KEY,refresh);}
export function clearReportingTokens(){if(typeof window==='undefined')return;window.sessionStorage.removeItem(ACCESS_KEY);window.sessionStorage.removeItem(REFRESH_KEY);}
