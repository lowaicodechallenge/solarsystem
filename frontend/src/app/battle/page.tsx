"use client";
import BattleArena from "@/components/BattleArena";
import { USER_ID } from "@/lib/utils";

export default function BattlePage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">⚔️ 자세 대결</h1>
        <p className="text-gray-400 text-sm mt-1">
          비슷한 자세 문제를 가진 상대와 60초 운동 배틀! 더 정확한 자세를 유지한 사람이 승리합니다.
        </p>
      </div>

      <BattleArena userId={USER_ID} />

      <div className="mt-6 glass-card rounded-2xl p-4 space-y-2 text-sm text-gray-400">
        <p className="font-semibold text-white text-sm">🏆 대결 규칙</p>
        <p>• AI가 자세 분석 점수(0~100점)를 실시간으로 계산합니다</p>
        <p>• 60초 동안 높은 점수를 유지한 사람이 승리합니다</p>
        <p>• 비슷한 자세 문제를 가진 상대와 자동 매칭됩니다</p>
        <p>• 대결 중에도 실시간 자세 교정 피드백이 제공됩니다</p>
      </div>
    </div>
  );
}
