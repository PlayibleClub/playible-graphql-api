export function getSeasonType(type: string): number{
  switch(type){
    case "REG": return 1
    case "PRE": return 2
    case "POST": return 3
    case "OFF": return 4
    case "STAR": return 5
    default: return 0
  }
}