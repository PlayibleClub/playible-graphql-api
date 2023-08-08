import { SportType, SportMap } from "../utils/types";
export function getSportType(accountId: string): SportType{
  let sport: SportType = SportType.MLB //default value
  const obj: SportMap = {
    'baseball': SportType.MLB,
    'basketball': SportType.NBA,
    'nfl': SportType.NFL
  }
  let key: keyof SportMap
  for(key in obj){
    if(accountId.includes(key)){
      sport = obj[key]
    }
  }

  return sport
}