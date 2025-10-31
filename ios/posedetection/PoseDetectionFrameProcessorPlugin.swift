//
//  PoseDetectionFrameProcessorPlugin.swift
//  react-native-mediapipe
//
//  Created by Charles Parker on 3/24/24.
//

import Foundation
import Vision

import MediaPipeTasksVision

import AVFoundation
import CoreImage

@objc(PoseDetectionFrameProcessorPlugin)
public class PoseDetectionFrameProcessorPlugin: FrameProcessorPlugin {
  private var frameCounter: Int = 0

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any
  {
    guard let detectorHandleValue = arguments?["detectorHandle"] as? Double else {
      return false
    }
    // get the orientation argument. If its nil, return false
    guard let orientation = arguments?["orientation"] as? String else {
      return false
    }
    // convert the orientation string to a UIImage.Orientation
    guard let uiOrientation = uiImageOrientation(from: orientation) else {
      return false
    }
    

    // Now that we have a valid Double, attempt to retrieve the detector using it
    guard let detector = PoseDetectionModule.detectorMap[Int(detectorHandleValue)] else {
      return false
    }

    let buffer = frame.buffer

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else {
      print("Failed to get pixel buffer from sample buffer")
      return false
    }
    
    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    let context = CIContext()

    let transform = CGAffineTransform(rotationAngle: .pi/2)
      .translatedBy(x: ciImage.extent.height, y: 0)
      .scaledBy(x: -1, y: 1)
    
    let transformedImage = ciImage.transformed(by: transform)
    
    guard let cgImage = context.createCGImage(transformedImage, from: transformedImage.extent) else {
      print("Failed to create CGImage from CIImage")
      return false
    }
    
    let image = UIImage(cgImage: cgImage)

    detector.detectAsync(
      image: image,
      orientation: uiOrientation,
      timeStamps: Int(Date().timeIntervalSince1970 * 1000))
    return true
  }
}
