type CricketTeamJson = {
  key: string,
  code: string,
  name: string,
}
type CricketNationality = {
  short_code: string,
  code: string,
  name: string,
  official_name: string,
  is_region: boolean,
}
type CricketAthleteJson = {
  playerKey: string,
  name: string,
  jerseyName: string,
  gender: string,
  nationality: CricketNationality
  seasonalRole: string,
}
export interface CricketTeamInterface{
  key: CricketTeamJson
}

export interface CricketAthleteInterface{
  key: CricketAthleteJson
}

export interface CricketPointsBreakup{
  metric_rule_index: number,
  points: number,
  points_str: string,
}
