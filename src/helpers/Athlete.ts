import { Athlete } from '../entities/Athlete'
import { AthleteStat } from '../entities/AthleteStat'
export function computeShoheiOhtaniScores(athleteStat: any): number{
  //compute for hitting scores
  let fantasyScore = 0
  fantasyScore = +fantasyScore + +(athleteStat["Singles"] * 3)
  fantasyScore = +fantasyScore + +(athleteStat["Doubles"] * 5)
  fantasyScore = +fantasyScore + +(athleteStat["Triples"] * 8)
  fantasyScore = +fantasyScore + +(athleteStat["HomeRuns"] * 10)
  fantasyScore = +fantasyScore + +(athleteStat["RunsBattedIn"] * 2)
  fantasyScore = +fantasyScore + +(athleteStat["Runs"] * 2)
  fantasyScore = +fantasyScore + +(athleteStat["Walks"] * 2)
  fantasyScore = +fantasyScore + +(athleteStat["HitByPitch"] * 2)
  fantasyScore = +fantasyScore + +(athleteStat["StolenBases"] * 5)
  return fantasyScore
}