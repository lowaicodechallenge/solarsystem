"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { PoseDetector } from "@tensorflow-models/pose-detection";
import type { Keypoint } from "@tensorflow-models/pose-detection";
import { analyzeByExercise, drawPoseSkeleton, type PostureIssue, type PoseAngles } from "@/lib/poseAnalysis";

export type PoseState = {
  keypoints: Keypoint[];
  angles: PoseAngles;
  score: number;
  issues: PostureIssue[];
  signature: number[];
  isDetecting: boolean;
};

export function usePoseDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  exercise: string,
  enabled: boolean
) {
  const detectorRef = useRef<PoseDetector | null>(null);
  const animFrameRef = useRef<number>(0);
  const [state, setState] = useState<PoseState>({
    keypoints: [],
    angles: {},
    score: 0,
    issues: [],
    signature: [],
    isDetecting: false,
  });

  const initDetector = useCallback(async () => {
    const tf = await import("@tensorflow/tfjs");
    await import("@tensorflow/tfjs-backend-webgl");
    await tf.setBackend("webgl");
    await tf.ready();

    const poseDetection = await import("@tensorflow-models/pose-detection");
    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      }
    );
    detectorRef.current = detector;
  }, []);

  const detect = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;

    if (!video || !canvas || !detector || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    try {
      const poses = await detector.estimatePoses(video, { flipHorizontal: true });
      if (poses.length > 0) {
        const { keypoints, score: poseScore } = poses[0];
        const analysis = analyzeByExercise(exercise, keypoints as Keypoint[]);

        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawPoseSkeleton(ctx, keypoints as Keypoint[], analysis.issues, canvas.width, canvas.height);
        }

        setState({
          keypoints: keypoints as Keypoint[],
          angles: analysis.angles,
          score: analysis.score,
          issues: analysis.issues,
          signature: analysis.signature,
          isDetecting: true,
        });
      }
    } catch {
      // continue
    }

    animFrameRef.current = requestAnimationFrame(detect);
  }, [exercise, videoRef, canvasRef]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(animFrameRef.current);
      setState((s) => ({ ...s, isDetecting: false }));
      return;
    }

    let active = true;
    initDetector().then(() => {
      if (active) detect();
    });

    return () => {
      active = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [enabled, detect, initDetector]);

  return state;
}
