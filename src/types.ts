/** Tipos de las respuestas de la API JSON de Transfermarkt (tmapi). */

/** Valor monetario con su representación compacta ("€10.00M"). */
export interface Money {
  value: number | null;
  currency: string;
  compact: { prefix: string; content: string; suffix: string };
}

/** Valor monetario simple (sin marca de fecha). */
export interface Amount {
  value: number | null;
  currency: string;
  compact: { prefix: string; content: string; suffix: string };
}

export interface Season {
  id: number;
  display: string;
  cyclicalName: string;
  nonCyclicalName: string;
}

export interface PlayerProfile {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  shortName: string;
  artistName: string;
  displayName: string;
  lifeDates: {
    age: number;
    dateOfBirth: string;
    isDateOfBirthUnknown: boolean;
    dateOfDeath: string | null;
    isDateOfDeathUnknown: boolean;
  };
  birthPlaceDetails: {
    placeOfBirth: string;
    countryOfBirthId: number;
    placeOfBirthAdditionalInfo: string;
    gender: string;
  };
  nationalityDetails: {
    passportName: string;
    nationalities: { nationalityId: number; secondNationalityId: number };
  };
  attributes: {
    height: number | null;
    positionGroup: string;
    positionGroupName: string;
    positionId: number;
    firstSidePositionId: number;
    secondSidePositionId: number;
    contractUntil: string | null;
    contractOptionId: number | null;
    formerClubsNote: string;
    consultantAgencyId: number | null;
    preferredFoot: { id: number; name: string } | null;
    outfitter: { id: number; name: string } | null;
    position: { id: number; name: string; shortName: string; category: string };
    firstSidePosition: { id: number; name: string; shortName: string; category: string } | null;
    secondSidePosition: { id: number; name: string; shortName: string; category: string } | null;
    consultantAgency: {
      id: number;
      name: string;
      shortName: string;
      verificationStatus: string;
    } | null;
    lastContractRenewal: { year: number; month: number; day: number } | null;
  };
  preferences: { themeId: number };
  relativeUrl: string;
  portraitUrl: string;
  portraitUrlSource: string;
  marketValueDetails: {
    current: (Money & { determined: string }) | null;
    previous: (Money & { determined: string }) | null;
    delta: { value: string; percentage: string; isVisible: boolean; type: string } | null;
    highest: (Money & { determined: string }) | null;
  };
  clubAssignments: Array<{
    playerId: string;
    clubId: string;
    shirtNumber: number | null;
    isCaptain: boolean;
    type: string;
    debut: string | null;
    start: string | null;
  }>;
}

export interface MarketValueHistoryEntry {
  playerId: string;
  seasonId: number;
  clubId: string;
  age: number;
  marketValue: Money & { determined: string };
}

export interface MarketValueHistory {
  history: MarketValueHistoryEntry[];
  playerIds: string[];
  clubIds: string[];
  /** Último registro de valor: sigue la misma forma que las entradas del historial. */
  current: (MarketValueHistoryEntry & { marketValue: Money & { determined: string } }) | null;
}

export interface TransferSide {
  competitionId: string;
  countryId: number;
  clubId: string;
  coachId: string;
}

export interface TransferDetails {
  playerId: string;
  date: string;
  contractUntilDate: string | null;
  seasonId: number;
  isPending: boolean;
  marketValue: Money;
  age: number;
  fee: Money;
  remainingContractPeriod?: { days: number; daysDisplay: string };
  season: Season;
}

export interface TransferEntry {
  id: string;
  transferSource: TransferSide;
  transferDestination: TransferSide;
  details: TransferDetails;
  typeDetails: { type: string; name: string; feeDescription: string };
  relativeUrl: string;
}

export interface TransferHistory {
  playerId: string;
  history: {
    terminated: TransferEntry[];
    pending: TransferEntry[];
    url: string;
    feeSum: Amount;
    averageAge: number;
    totalMarketValue: Amount;
  };
  clubIds: string[];
  coachIds: string[];
  competitionIds: string[];
  mostRecentTransfer: TransferEntry | null;
}

export interface ClubTransferGroup {
  terminated: TransferEntry[];
  pending: TransferEntry[];
  url: string;
  feeSum: Amount;
  averageAge: number;
}

export interface ClubTransferHistory {
  clubId: string;
  arrivals: ClubTransferGroup;
  departures: ClubTransferGroup;
  totalArrivalCount: number;
  totalDeparturesCount: number;
  balance: Amount;
  playerIds: string[];
  coachIds: string[];
  competitionIds: string[];
}

export interface ClubProfile {
  id: string;
  name: string;
  baseDetails: {
    shortName: string;
    abbreviation: string;
    isNationalTeam: boolean;
    countryId: number;
    mainClubId: string;
    clubTypeId: number;
    primaryCompetitionId: string;
    superiorClubId: number | null;
    superiorClub: {
      id: string;
      name: string;
      location: {
        countryId: number;
        street: string;
        postcode: string;
        city: string;
        latitude: number;
        longitude: number;
      };
      colors: { firstColor: string; secondColor: string; thirdColor: string };
    } | null;
  };
  squadDetails: {
    squadSize: number;
    averageAge: number;
    averageAgeDisplay: string;
    averageMarketValue: Amount & { determined: string };
    acquisitionValue: Amount & { determined: string };
    top18PlayersMarketValue: Amount & { determined: string };
    top18SharePercentage: { value: number; display: string };
    currentMarketValue: Amount & { determined: string };
  };
  metadata: { created: string | null; updated: string };
  relativeUrl: string;
  isSpecialClub: boolean;
  identifier: string;
  relevantCompetitionId: string;
  crestUrl: string;
}

export interface SquadEntry {
  playerId: string;
  clubId: string;
  shirtNumber: number | null;
  isCaptain: boolean;
  type: string;
}

export interface CompetitionProfile {
  id: string;
  name: string;
  shortName: string;
  currentSeasonId: number;
  originDetails: { countryId: number; confederationId: number };
  baseDetails: {
    shortName: string;
    standardGameDurationMinutes: number;
    gameDayCount: number;
    closestGameDay: number;
    isStandalone: boolean;
    isOngoing: boolean;
    isTournament: boolean;
    stage: string;
  };
  totalMarketValue: Amount;
  showMarketValue: boolean;
  typeId: number;
  relativeUrl: string;
}

export interface LeagueTableClub {
  clubId: string;
  group: { division: string; name: string };
  game: {
    isPlaying: boolean;
    points: number;
    pointsMinus: number | null;
    winCount: number;
    lossCount: number;
    drawCount: number;
    totalCount: number;
  };
  goal: { totalCount: number; concededCount: number; differenceCount: number };
  ranking: { current: number; previous: number; shift: string };
  positioning: { color: string; description: string };
}

export interface LeagueTable {
  competitionId: string;
  tables: Array<{
    clubs: LeagueTableClub[];
    [key: string]: unknown;
  }>;
}

export interface NationalCareerHistory {
  playerId?: string;
  history: Array<{
    playerId: string;
    /** Id de la selección nacional (also resolvable via /club/{id}). */
    clubId: string;
    gamesPlayed: number;
    goalsScored: number;
    shirtNumber: number | null;
    isCaptain: boolean;
    debut: string | null;
    debutCoachId: string;
    debutGameId: string;
    lastGame: string | null;
    lastGameId: string;
    careerState: string;
  }>;
  [key: string]: unknown;
}

export interface PerformanceGame {
  gameInformation: {
    gameId: string;
    competitionId: string;
    competitionTypeId: number;
    competitionGroupId: string | null;
    refereeId: number;
    stadiumId: number;
    seasonId: number;
    gameDay: number | null;
    gameDuration: number | null;
    isNationalGame: boolean;
    isLiveGame: boolean;
    isGameReportCreated: boolean;
    isGamePostponed: boolean;
    gameState: string;
    date: { dateTimeUTC: string; isTimeDefined: boolean };
    season: Season;
  };
  clubsInformation: {
    club: {
      venue: string;
      clubId: string;
      coachId: string;
      goalsTotal: number;
      opponentGoalsTotal: number;
      clubRank: number | null;
      tacticId: number | null;
      points: number | null;
    };
    opponent: {
      venue: string;
      clubId: string;
      coachId: string;
      goalsTotal: number;
      opponentGoalsTotal: number;
      clubRank: number | null;
      tacticId: number | null;
      points: number | null;
    };
  };
  statistics: {
    generalStatistics: {
      shirtNumber: number | null;
      isCaptain: boolean;
      participationState: string;
      positionId: number | null;
      injuryId: number;
      absenceId: number;
      primaryClubId: string;
      playedForAnotherTeamGameId: string | null;
      age: number;
      grade: string | null;
      pointsOnThePitch: number | null;
    };
    goalStatistics: {
      goalsScoredTotal: number | null;
      goalsScoredTotalOfficial: number | null;
      assists: number | null;
      assistsOfficial: number | null;
      ownGoalsScored: number | null;
      teamGoalsOnThePitch: number | null;
      opponentGoalsOnThePitch: number | null;
      penaltyShooterAttempts: number | null;
      penaltyShooterGoalsScored: number | null;
      penaltyShooterMisses: number | null;
      penaltyGoalkeeperSaves: number | null;
      penaltyGoalkeeperGoalsConceded: number | null;
      scoringAttempts: number | null;
      scoringAttemptsOnGoal: number | null;
      scoringAttemptsOffGoal: number | null;
      scoringAttemptsBlocked: number | null;
    };
    cardStatistics: {
      yellowCard: number | null;
      yellowCardNet: number | null;
      yellowCardGross: number | null;
      yellowRedCard: number | null;
      redCard: number | null;
      redCardsRescinded: number | null;
      fairPlayPoints: number | null;
    };
    playingTimeStatistics?: {
      playedMinutes: number | null;
      isStarting: boolean | null;
      substitutedIn: number | null;
      substitutedOut: number | null;
    };
    duelStatistics?: {
      tackles: number | null;
      tacklesWon: number | null;
      tacklesLost: number | null;
      foulsCommitted: number | null;
      foulsGained: number | null;
      offsides: number | null;
    };
    distributionStatistics?: {
      passes: number | null;
      passesReached: number | null;
      passesFailed: number | null;
      corners: number | null;
      throwIns: number | null;
    };
    [key: string]: unknown;
  };
}

export interface PerformanceData {
  playerId: string;
  performance: PerformanceGame[];
  clubIds: string[];
  coachIds: string[];
  competitionIds: string[];
  gameIds: string[];
}

export interface ReferenceData {
  absences: Array<{ id: number; name: string; isSuspension: boolean }>;
  actions: Array<{ id: number; action: string; type: string }>;
  competitionTypes: Array<{ id: number; name: string }>;
  confederations: Array<{ id: number; name: string; officialName: string; flagUrl: string }>;
  contracts: Array<{ id: number; name: string; longName: string; abbreviation: string }>;
  countries: Array<{
    id: number;
    name: string;
    fifaCode: string;
    confederationId: number;
    flagUrl: string;
  }>;
  injuries: Array<{ id: number; name: string; categoryId: number }>;
  outfitters: Array<{ id: number; name: string }>;
  positions: Array<{ id: number; name: string; shortName: string; category: string }>;
  roles: Array<{ id: number; name: string }>;
  tactics: Array<{ id: number; tactic: string }>;
  [key: string]: unknown;
}
