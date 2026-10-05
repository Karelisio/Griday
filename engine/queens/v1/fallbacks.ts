/**
 * Puzzles de secours Queens V1 — FICHIER GÉNÉRÉ par scripts/build-queens-fallbacks.ts, FIGÉ.
 * Chaque entrée est reproductible depuis sa graine (vérifié par version.test.ts).
 */
export interface QueensFallbackEntry {
  readonly size: number;
  readonly tier: 1 | 2 | 3 | 4;
  /** Graine de base ayant produit la grille (pipeline V1, tentative indiquée). */
  readonly seed: string;
  readonly attempt: number;
  /** Régions, un chiffre base 36 par case. */
  readonly regions: string;
  /** Colonne de la reine de chaque ligne, base 36. */
  readonly solution: string;
  readonly score: number;
  readonly hardest: string;
}

export const QUEENS_FALLBACKS_V1: readonly QueensFallbackEntry[] = [
  { size: 6, tier: 1, seed: 'fallback:queens:v1:6:1:0', attempt: 0, regions: '000122030112400515400555445555455555', solution: '514203', score: 8, hardest: 'region-line' },
  { size: 6, tier: 1, seed: 'fallback:queens:v1:6:1:1', attempt: 0, regions: '000111202233222333222233422233555333', solution: '415302', score: 10, hardest: 'region-line' },
  { size: 6, tier: 1, seed: 'fallback:queens:v1:6:1:2', attempt: 2, regions: '011233411223442233444222444422444455', solution: '025314', score: 10, hardest: 'line-region' },
  { size: 6, tier: 2, seed: 'fallback:queens:v1:6:2:0', attempt: 1, regions: '000111110122311142333122335122555552', solution: '204153', score: 14, hardest: 'attack' },
  { size: 6, tier: 2, seed: 'fallback:queens:v1:6:2:1', attempt: 0, regions: '012211011111033311000331033334053344', solution: '240351', score: 20, hardest: 'attack' },
  { size: 6, tier: 2, seed: 'fallback:queens:v1:6:2:2', attempt: 0, regions: '000122033122033142333344333445444444', solution: '403152', score: 16, hardest: 'attack' },
  { size: 6, tier: 3, seed: 'fallback:queens:v1:6:3:0', attempt: 5, regions: '000111200001233044223444553444555544', solution: '530241', score: 60, hardest: 'locked-pair' },
  { size: 6, tier: 3, seed: 'fallback:queens:v1:6:3:1', attempt: 6, regions: '000011022012002222333222344552334555', solution: '503142', score: 52, hardest: 'locked-pair' },
  { size: 6, tier: 3, seed: 'fallback:queens:v1:6:3:2', attempt: 0, regions: '012222011132000032404033404333444555', solution: '152403', score: 54, hardest: 'locked-pair' },
  { size: 6, tier: 4, seed: 'fallback:queens:v1:6:4:0', attempt: 1, regions: '001122011222001112031142333445344455', solution: '403152', score: 68, hardest: 'locked-set' },
  { size: 6, tier: 4, seed: 'fallback:queens:v1:6:4:1', attempt: 2, regions: '000111020011222211223344253445255555', solution: '530241', score: 86, hardest: 'contradiction' },
  { size: 6, tier: 4, seed: 'fallback:queens:v1:6:4:2', attempt: 6, regions: '000112003122033124034444335554355554', solution: '304152', score: 160, hardest: 'contradiction' },
  { size: 7, tier: 1, seed: 'fallback:queens:v1:7:1:0', attempt: 5, regions: '0102334000233400022340005544000555500555555555665', solution: '1536024', score: 15, hardest: 'line-region' },
  { size: 7, tier: 1, seed: 'fallback:queens:v1:7:1:1', attempt: 5, regions: '0001112011111231114123444411444441144455654445555', solution: '1460253', score: 15, hardest: 'line-region' },
  { size: 7, tier: 1, seed: 'fallback:queens:v1:7:1:2', attempt: 2, regions: '0001111022113405221145522214622221166222116622111', solution: '2516304', score: 9, hardest: 'region-line' },
  { size: 7, tier: 2, seed: 'fallback:queens:v1:7:2:0', attempt: 2, regions: '0000011000211100021130033333443333345555534555563', solution: '6314025', score: 25, hardest: 'attack' },
  { size: 7, tier: 2, seed: 'fallback:queens:v1:7:2:1', attempt: 1, regions: '0001111200003124555332225563222566322255532255553', solution: '5316402', score: 21, hardest: 'attack' },
  { size: 7, tier: 2, seed: 'fallback:queens:v1:7:2:2', attempt: 0, regions: '0111111021133102233410255331025533100533310056633', solution: '6152403', score: 19, hardest: 'attack' },
  { size: 7, tier: 3, seed: 'fallback:queens:v1:7:3:0', attempt: 0, regions: '0001223001123341112354441115466615566555556666555', solution: '4153062', score: 43, hardest: 'locked-pair' },
  { size: 7, tier: 3, seed: 'fallback:queens:v1:7:3:1', attempt: 0, regions: '0111222001111300141335544433556444455666445555555', solution: '5316420', score: 63, hardest: 'locked-pair' },
  { size: 7, tier: 3, seed: 'fallback:queens:v1:7:3:2', attempt: 3, regions: '0000112000112200002223034522333455533345563344566', solution: '1350462', score: 27, hardest: 'locked-pair' },
  { size: 7, tier: 4, seed: 'fallback:queens:v1:7:4:0', attempt: 0, regions: '0000122330112234011224441552464165546616654666665', solution: '2051364', score: 55, hardest: 'locked-set' },
  { size: 7, tier: 4, seed: 'fallback:queens:v1:7:4:1', attempt: 5, regions: '0001222011122231122223414566344456544455654455555', solution: '1360524', score: 165, hardest: 'contradiction' },
  { size: 7, tier: 4, seed: 'fallback:queens:v1:7:4:2', attempt: 10, regions: '0111222013111201312220033455003445533364453366644', solution: '2605314', score: 725, hardest: 'contradiction' },
  { size: 8, tier: 1, seed: 'fallback:queens:v1:8:1:0', attempt: 3, regions: '0100000200003332004033356043333566663355666635556655555566777755', solution: '17025364', score: 10, hardest: 'region-line' },
  { size: 8, tier: 1, seed: 'fallback:queens:v1:8:1:1', attempt: 1, regions: '0000011102200011023300114443001155440011554550116555555766555555', solution: '61352470', score: 14, hardest: 'line-region' },
  { size: 8, tier: 1, seed: 'fallback:queens:v1:8:1:2', attempt: 4, regions: '0111111201111112031111440301155500055555000655550077775500775555', solution: '74615302', score: 10, hardest: 'region-line' },
  { size: 8, tier: 2, seed: 'fallback:queens:v1:8:2:0', attempt: 1, regions: '0001123300222243002222230052222350526663505555665057556655577766', solution: '46275130', score: 24, hardest: 'attack' },
  { size: 8, tier: 2, seed: 'fallback:queens:v1:8:2:1', attempt: 3, regions: '0111111101000122000001120003111240533312455555524555675245557777', solution: '57130246', score: 24, hardest: 'attack' },
  { size: 8, tier: 2, seed: 'fallback:queens:v1:8:2:2', attempt: 5, regions: '0000112200011112330444223502222235000022550556725505577255555772', solution: '47302516', score: 26, hardest: 'attack' },
  { size: 8, tier: 3, seed: 'fallback:queens:v1:8:3:0', attempt: 3, regions: '0000122300111223001011234000055544440055444555554466577744667777', solution: '53716024', score: 46, hardest: 'locked-pair' },
  { size: 8, tier: 3, seed: 'fallback:queens:v1:8:3:1', attempt: 1, regions: '0111222200111222303442223034422233344422333554443365574736667777', solution: '04625371', score: 48, hardest: 'locked-pair' },
  { size: 8, tier: 3, seed: 'fallback:queens:v1:8:3:2', attempt: 5, regions: '0011112200011222001112230011223344422553444465554446657744665577', solution: '20741536', score: 48, hardest: 'locked-pair' },
  { size: 8, tier: 4, seed: 'fallback:queens:v1:8:4:0', attempt: 2, regions: '0011111102222331024243110244441155556661557776665555767755777777', solution: '06137524', score: 60, hardest: 'locked-set' },
  { size: 8, tier: 4, seed: 'fallback:queens:v1:8:4:1', attempt: 1, regions: '0122233301112223011111430051114605554446077747660777777600000076', solution: '15724630', score: 186, hardest: 'contradiction' },
  { size: 8, tier: 4, seed: 'fallback:queens:v1:8:4:2', attempt: 0, regions: '0000122233001222331112224311522244415266474556664777555647555666', solution: '30462751', score: 56, hardest: 'locked-set' },
  { size: 9, tier: 1, seed: 'fallback:queens:v1:9:1:0', attempt: 3, regions: '000000111220001111000011331000111333451111333455511333555561373555563333555568883', solution: '315802746', score: 21, hardest: 'region-line' },
  { size: 9, tier: 1, seed: 'fallback:queens:v1:9:1:1', attempt: 10, regions: '000000112000344512006333552666337522663335522663555555666655555888888588888888888', solution: '741582063', score: 15, hardest: 'region-line' },
  { size: 9, tier: 1, seed: 'fallback:queens:v1:9:1:2', attempt: 8, regions: '000001111000001122010011122111113142555153444555555464577577444777774444777788844', solution: '381507264', score: 17, hardest: 'region-line' },
  { size: 9, tier: 2, seed: 'fallback:queens:v1:9:2:0', attempt: 2, regions: '000000000112111000112110000111133330443335553443333333444433676444468676444466666', solution: '302461758', score: 17, hardest: 'attack' },
  { size: 9, tier: 2, seed: 'fallback:queens:v1:9:2:1', attempt: 3, regions: '012222333012223333011222333042222333042252333444555566455557577445857777455555777', solution: '052418637', score: 25, hardest: 'attack' },
  { size: 9, tier: 2, seed: 'fallback:queens:v1:9:2:2', attempt: 0, regions: '000000111200030011220030111400556551405555551788555551788885851788888877777777777', solution: '241506837', score: 19, hardest: 'attack' },
  { size: 9, tier: 3, seed: 'fallback:queens:v1:9:3:0', attempt: 4, regions: '000000111002230111442331151442266151748666155748666655788666555777777555777777775', solution: '048316275', score: 65, hardest: 'locked-pair' },
  { size: 9, tier: 3, seed: 'fallback:queens:v1:9:3:1', attempt: 3, regions: '011122223041222333044252333005553366005533666705733866707778866707777866777777886', solution: '351602847', score: 57, hardest: 'locked-pair' },
  { size: 9, tier: 3, seed: 'fallback:queens:v1:9:3:2', attempt: 3, regions: '011222334011222344011524444005524644705554646705586646778886646888866646888886666', solution: '752813064', score: 51, hardest: 'locked-pair' },
  { size: 9, tier: 4, seed: 'fallback:queens:v1:9:4:0', attempt: 1, regions: '000001112030041512030645522336645222377445224377744444337778844333378884337778888', solution: '175364208', score: 73, hardest: 'locked-set' },
  { size: 9, tier: 4, seed: 'fallback:queens:v1:9:4:1', attempt: 0, regions: '000112234000122334001122334005552444055555546757555666777758668777778688777778888', solution: '742803615', score: 67, hardest: 'locked-set' },
  { size: 9, tier: 4, seed: 'fallback:queens:v1:9:4:2', attempt: 1, regions: '001222222001112223441552333444556333444566663455577333885573333888888333888888333', solution: '162075384', score: 83, hardest: 'locked-set' },
  { size: 10, tier: 1, seed: 'fallback:queens:v1:10:1:0', attempt: 2, regions: '0000000111222200000122220003342252203334222226333377266666337766668893777769899377776999997777799999', solution: '7492083615', score: 20, hardest: 'region-line' },
  { size: 10, tier: 1, seed: 'fallback:queens:v1:10:1:1', attempt: 3, regions: '0111111122011111112201113344450661334445001113744400013374440777777744008799777400000977740000077744', solution: '8391746250', score: 10, hardest: 'single' },
  { size: 10, tier: 1, seed: 'fallback:queens:v1:10:1:2', attempt: 4, regions: '0000000000000000101100023411110032344444333333445433333344443366334477377634477787777777778889977777', solution: '1936852704', score: 16, hardest: 'region-line' },
  { size: 10, tier: 2, seed: 'fallback:queens:v1:10:2:0', attempt: 0, regions: '0000012233044402222344000202534440000253444662222344446227338466662773848889333384889993338889999933', solution: '5081647293', score: 34, hardest: 'attack' },
  { size: 10, tier: 2, seed: 'fallback:queens:v1:10:2:1', attempt: 0, regions: '0000112334055111333400511111440056611144005551114400755541440875554444087755554907777775997777777799', solution: '6853047192', score: 28, hardest: 'attack' },
  { size: 10, tier: 2, seed: 'fallback:queens:v1:10:2:2', attempt: 1, regions: '0000001111222000111122000311112202222445222222555562655557776665555787666599978766699999996699999999', solution: '6357194802', score: 22, hardest: 'attack' },
  { size: 10, tier: 3, seed: 'fallback:queens:v1:10:3:0', attempt: 5, regions: '0000000000100000000011102202003114422222344452256234445555663445557776338888777633998997773999999977', solution: '8053796142', score: 66, hardest: 'locked-pair' },
  { size: 10, tier: 3, seed: 'fallback:queens:v1:10:3:1', attempt: 2, regions: '0000011122330041122233344222553334222255344422655534442266557774466655877777665588788966658888999655', solution: '4617392085', score: 34, hardest: 'locked-pair' },
  { size: 10, tier: 3, seed: 'fallback:queens:v1:10:3:2', attempt: 1, regions: '0000000001000000001122033311112233334111222334441522333454456267745555626777555566678788956888888999', solution: '2851693047', score: 58, hardest: 'locked-pair' },
  { size: 10, tier: 4, seed: 'fallback:queens:v1:10:4:0', attempt: 0, regions: '0000011111000111121100000112110303222211333322241566677444556666744855669694885569999488556666999855', solution: '8271935064', score: 60, hardest: 'locked-set' },
  { size: 10, tier: 4, seed: 'fallback:queens:v1:10:4:1', attempt: 2, regions: '0001222333000122223300014552330666452233777644483377764698837766469988977666988899769998889999998888', solution: '3750691482', score: 110, hardest: 'locked-set' },
  { size: 10, tier: 4, seed: 'fallback:queens:v1:10:4:2', attempt: 0, regions: '0000111111000001111100022113330022233333022433533322244556337724556668774445558877444995587444449955', solution: '4182637950', score: 68, hardest: 'locked-set' },
];
