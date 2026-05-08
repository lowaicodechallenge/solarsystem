"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { EXERCISES, getScoreColor } from "@/lib/utils";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { useSocket } from "@/hooks/useSocket";

type BattleState = "idle" | "searching" | "active" | "finished";

type Props = { userId: string };

export default function BattleArena({ userId }: Props) {
  const [state, setState] = useState<BattleState>("idle");
  const [exercise, setExercise] = useState("squat");
  const [battleId, setBattleId] = useState<string | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [result, setResult] = useState<{ winner: string; myScore: number; opponentScore: number } | null>(null);
  const [timer, setTimer] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const scoreEmitRef = useRef<ReturnType<typeof setInterval>>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pose = usePoseDetection(videoRef, canvasRef, exercise, state === "active");
  const { emitScore, onScoreUpdate } = useSocket(battleId, userId);

  // Real-time score sync
  useEffect(() => {
    if (state !== "active") return;
    const cleanup = onScoreUpdate((data) => {
      setMyScore(data.user1_score);
      setOpponentScore(data.user2_score);
    });
    return () => { cleanup?.(); };
  }, [state, onScoreUpdate]);

  // Emit score every 2s
  useEffect(() => {
    if (state !== "active") return;
    scoreEmitRef.current = setInterval(() => {
      emitScore(pose.score);
      setMyScore(pose.score);
    }, 2000);
    return () => {
      if (scoreEmitRef.current) clearInterval(scoreEmitRef.current);
    };
  }, [state, pose.score, emitScore]);

  // Battle countdown
  useEffect(() => {
    if (state !== "active") return;
    setTimer(60);
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          endBattle();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const joinBattle = async () => {
    setState("searching");
    await startCamera();

    const res = await api.joinBattle({
      user_id: userId,
      exercise_type: exercise,
      pose_signature: pose.signature,
    }) as { status: string; battle?: { battle_id: string } };

    if (res.status === "matched" && res.battle) {
      setBattleId(res.battle.battle_id);
      setState("active");
    } else {
      // Poll for match
      const poll = setInterval(async () => {
        const r = await api.joinBattle({
          user_id: userId,
          exercise_type: exercise,
          pose_signature: pose.signature,
        }) as { status: string; battle?: { battle_id: string } };
        if (r.status === "matched" && r.battle) {
          clearInterval(poll);
          setBattleId(r.battle.battle_id);
          setState("active");
        }
      }, 3000);
      setTimeout(() => {
        clearInterval(poll);
        if (state === "searching") {
          setState("idle");
          stopCamera();
          alert("대결 상대를 찾지 못했습니다. 다시 시도해 주세요.");
        }
      }, 30000);
    }
  };

  const endBattle = useCallback(async () => {
    if (!battleId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (scoreEmitRef.current) clearInterval(scoreEmitRef.current);

    const res = await api.endBattle(battleId) as { winner: string; user1_score: number; user2_score: number };
    const won = res.winner === userId;
    setResult({
      winner: res.winner,
      myScore: Math.max(myScore, pose.score),
      opponentScore,
    });
    setState("finished");
    stopCamera();
  }, [battleId, myScore, opponentScore, pose.score, userId]);

  const reset = async () => {
    if (battleId) await api.leaveBattle(userId).catch(() => {});
    setBattleId(null);
    setState("idle");
    setMyScore(0);
    setOpponentScore(0);
    setResult(null);
    stopCamera();
  };

  return (
    <div className="space-y-4">
      {state === "idle" && (
        <div className="glass-card rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <div className="text-4xl mb-2">⚔️</div>
            <h2 className="text-xl font-bold text-white">자세 대결</h2>
            <p className="text-gray-400 text-sm mt-1">비슷한 자세 문제를 가진 상대와 60초 운동 대결!</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-400 font-medium">운동 선택</p>
            <div className="grid grid-cols-3 gap-2">
              {EXERCISES.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setExercise(ex.id)}
                  className={`p-3 rounded-xl text-center transition-all border ${
                    exercise === ex.id
                      ? "border-primary-500 bg-primary-500/10"
                      : "border-white/5 bg-dark-700 hover:border-white/20"
                  }`}
                >
                  <div className="text-2xl">{ex.emoji}</div>
                  <div className="text-xs text-gray-300 mt-1">{ex.name}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={joinBattle}
            className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-black font-bold rounded-xl transition-all glow-green"
          >
            대결 찾기 🔍
          </button>
        </div>
      )}

      {state === "searching" && (
        <div className="glass-card rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-white font-semibold">대결 상대를 찾는 중...</p>
          <p className="text-gray-400 text-sm">비슷한 {EXERCISES.find((e) => e.id === exercise)?.name} 자세를 가진 상대를 매칭합니다</p>
          <button onClick={reset} className="px-4 py-2 bg-dark-500 text-gray-400 rounded-xl text-sm">
            취소
          </button>
          {/* Preview camera */}
          <div className="relative rounded-xl overflow-hidden aspect-video bg-dark-700 mt-2">
            <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
            <canvas ref={canvasRef} className="pose-canvas scale-x-[-1]" />
          </div>
        </div>
      )}

      {state === "active" && (
        <div className="space-y-3">
          {/* Score bar */}
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-center">
                <p className="text-xs text-gray-400">나</p>
                <p className="text-2xl font-bold" style={{ color: getScoreColor(myScore) }}>
                  {myScore.toFixed(0)}
                </p>
              </div>
              <div className="text-center">
                <div className="text-lg font-mono font-bold text-white battle-active">{timer}s</div>
                <p className="text-xs text-gray-500">남은 시간</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400">상대</p>
                <p className="text-2xl font-bold" style={{ color: getScoreColor(opponentScore) }}>
                  {opponentScore.toFixed(0)}
                </p>
              </div>
            </div>
            {/* Progress bars */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-4">나</span>
                <div className="flex-1 h-2 bg-dark-500 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${myScore}%`, background: getScoreColor(myScore) }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-4">상대</span>
                <div className="flex-1 h-2 bg-dark-500 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${opponentScore}%`, background: getScoreColor(opponentScore) }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Camera */}
          <div className="relative rounded-2xl overflow-hidden aspect-video bg-dark-700">
            <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
            <canvas ref={canvasRef} className="pose-canvas scale-x-[-1]" />
            {/* Real-time correction */}
            {pose.issues.find((i) => i.severity !== "good") && (
              <div className="absolute bottom-3 left-3 right-3 bg-amber-500/90 rounded-xl px-3 py-2 text-sm font-semibold text-center">
                {pose.issues.find((i) => i.severity !== "good")?.message}
              </div>
            )}
          </div>

          <button
            onClick={endBattle}
            className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm font-medium transition-all"
          >
            대결 포기
          </button>
        </div>
      )}

      {state === "finished" && result && (
        <div className="glass-card rounded-2xl p-8 text-center space-y-4">
          <div className="text-5xl">{result.winner === userId ? "🏆" : result.winner === "draw" ? "🤝" : "😅"}</div>
          <h2 className="text-2xl font-bold text-white">
            {result.winner === userId ? "승리!" : result.winner === "draw" ? "무승부" : "아쉽지만 패배..."}
          </h2>
          <div className="flex justify-center gap-8 py-3">
            <div className="text-center">
              <p className="text-3xl font-bold" style={{ color: getScoreColor(result.myScore) }}>
                {result.myScore.toFixed(0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">내 점수</p>
            </div>
            <div className="text-4xl text-gray-600">vs</div>
            <div className="text-center">
              <p className="text-3xl font-bold" style={{ color: getScoreColor(result.opponentScore) }}>
                {result.opponentScore.toFixed(0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">상대 점수</p>
            </div>
          </div>
          <button
            onClick={reset}
            className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-black font-bold rounded-xl transition-all"
          >
            다시 대결하기
          </button>
        </div>
      )}
    </div>
  );
}
