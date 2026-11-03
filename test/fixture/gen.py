import subprocess, random, json, time, datetime
random.seed(7)
import os
SF=os.environ.get('STOCKFISH_PATH') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'bin', 'stockfish')
def eng():
    p=subprocess.Popen([SF],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1)
    p.stdin.write("uci\nisready\n"); p.stdin.flush()
    while not p.stdout.readline().startswith("readyok"): pass
    return p
def best(p, moves, skill):
    p.stdin.write(f"setoption name Skill Level value {skill}\nposition startpos moves {' '.join(moves)}\ngo depth {3 if skill<5 else 6}\n"); p.stdin.flush()
    while True:
        l=p.stdout.readline()
        if l.startswith("bestmove"): return l.split()[1]
import chess, chess.pgn
games=[]
p=eng()
now=time.time()
for gi in range(16):
    me_white = gi%2==0
    base, inc = random.choice([(180,2),(600,0),(300,0)])
    b=chess.Board(); moves=[]; clocks={True:base, False:base}; node_moves=[]
    while not b.is_game_over() and len(moves)<130:
        mine = (b.turn==chess.WHITE)==me_white
        skill = random.choice([0,1,2,3]) if mine else random.choice([1,2,4,6])
        mv = best(p, moves, skill)
        if mv in (None,"(none)"): break
        spent = random.uniform(1,20) if len(moves)>6 else random.uniform(0.5,3)
        if clocks[b.turn] < 40: spent = random.uniform(0.5, 4)
        clocks[b.turn] = max(1.0, clocks[b.turn]-spent+inc)
        node_moves.append((chess.Move.from_uci(mv), clocks[b.turn]))
        b.push_uci(mv); moves.append(mv)
    res=b.result(claim_draw=True)
    if res=="*": res = "1-0" if random.random()<0.5 else "0-1"
    g=chess.pgn.Game()
    me="jugador"; opp=random.choice(["rival_a","rival_b","rival_c","rival_d","rival_e","rival_f"])
    g.headers["Event"]="Live Chess"; g.headers["Site"]="Chess.com"
    d=datetime.datetime.fromtimestamp(now-(16-gi)*1.3*86400)
    g.headers["Date"]=d.strftime("%Y.%m.%d")
    g.headers["White"]= me if me_white else opp; g.headers["Black"]= opp if me_white else me
    g.headers["Result"]=res; g.headers["TimeControl"]=f"{base}+{inc}" if inc else str(base)
    g.headers["WhiteElo"]=str(random.randint(300,360)); g.headers["BlackElo"]=str(random.randint(300,360))
    n=g
    for mv,cl in node_moves:
        n=n.add_variation(mv); h=int(cl//3600); m=int((cl%3600)//60); s=cl%60
        n.comment=f"[%clk {h}:{m:02d}:{s:04.1f}]"
    games.append({"pgn":str(g),"date":int(d.timestamp()*1000),"white":g.headers["White"],"black":g.headers["Black"],"result":res,"speed":"blitz" if base<=300 else "rapid","whiteElo":int(g.headers["WhiteElo"]),"blackElo":int(g.headers["BlackElo"])})
json.dump(games,open("games.json","w"))
print(len(games),"partidas; jugadas:", [g["pgn"].count(".") for g in games][:8])
