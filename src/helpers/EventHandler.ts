import { Logger } from "@nestjs/common"
import { EventAddGameType, SportType, EventSubmitLineupType } from '../utils/types'
import { getSportType } from '../helpers/Sport'
import { Athlete } from '../entities/Athlete'
import { Game } from '../entities/Game'
import moment from 'moment-timezone'
import { GameTeam } from '../entities/GameTeam'
import { GameTeamAthlete } from '../entities/GameTeamAthlete'
export async function addGameHandler(event: EventAddGameType, sport: SportType): Promise<boolean> {

  const game = await Game.findOne({
    where:{
      gameId: event.data[0].game_id,
      sport: sport,
    }
  })

  if (!game){
    await Game.create({
      gameId: event.data[0].game_id,
      name: `Game ${event.data[0].game_id}`,
      description: 'on-going',
      startTime: moment(event.data[0].game_time_start),
      endTime: moment(event.data[0].game_time_end),
      sport: sport
    }).save()

    Logger.debug(`Game ${event.data[0].game_id} created for ${sport}`)
    return true
  } else{
    Logger.error(`Game ${event.data[0].game_id} already exists`)
    return false
  }
}

export async function submitLineupHandler(event: EventSubmitLineupType, sport: SportType): Promise<boolean>{

  const game = await Game.findOne({
    where: {
      gameId: event.data[0].game_id,
      sport: sport
    }
  })

  if(game){
    const gameTeam = await GameTeam.findOne({
      where: {
        game: {
          id: game.id
        },
        name: event.data[0].team_name,
        wallet_address: event.data[0].signer,
      },
      relations: {
        game: true
      }
      
    })

    if (!gameTeam){
      const currGameTeam = await GameTeam.create({
        game: game,
        name: event.data[0].team_name,
        wallet_address: event.data[0].signer
      }).save()

      const lineup = event.data[0].lineup
      for(let token_id of lineup){
        let apiId = ""
        if(token_id.includes("PR") || token_id.includes("SB")){
          token_id = token_id.split("_")[1]
        }
        apiId = token_id.split("CR")[0]
        
        const athlete = await Athlete.findOne({
          where: {
            apiId: parseInt(apiId)
          }
        })

        if (athlete){
          try{
            await GameTeamAthlete.create({
              gameTeam: currGameTeam,
              athlete: athlete
            }).save()
          } catch(e){
            Logger.error(e)
          }
        } else{
          Logger.error("ERROR athlete apiId not found, disregarding...")
        }
      }
      Logger.debug("Successfully added team")
      return true
    } else {
      Logger.error(`Team already exists on Game ${game.gameId} for ${sport}`)
      return false
    }
  } else{
    Logger.error(`Game ${event.data[0].game_id} does not exist for ${sport}`)
    return false
  }
}