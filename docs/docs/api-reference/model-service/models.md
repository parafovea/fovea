---
sidebar_label: models
title: models
---

Pydantic models for API requests and responses.

This module defines the request and response schemas for the model service API
endpoints, including video summarization, ontology augmentation, and object detection.

## Any

## Literal

## BaseModel

## Field

## SummarizeRequest Objects

```python
class SummarizeRequest(BaseModel)
```

Request model for video summarization endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### video\_id

#### video\_path

#### persona\_id

#### persona\_role

#### information\_need

#### frame\_sample\_rate

#### max\_frames

#### enable\_audio

#### audio\_language

#### enable\_speaker\_diarization

#### fusion\_strategy

## KeyFrame Objects

```python
class KeyFrame(BaseModel)
```

Key frame information from video analysis.

Fields are validated using Pydantic. See Field descriptions for details.

#### frame\_number

#### timestamp

#### description

#### confidence

## SummarizeResponse Objects

```python
class SummarizeResponse(BaseModel)
```

Response model for video summarization endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### id

#### video\_id

#### persona\_id

#### summary

#### visual\_analysis

#### audio\_transcript

#### key\_frames

#### confidence

#### transcript\_json

#### audio\_language

#### speaker\_count

#### audio\_model\_used

#### visual\_model\_used

#### fusion\_strategy

#### processing\_time\_audio

#### processing\_time\_visual

#### processing\_time\_fusion

## OntologyType Objects

```python
class OntologyType(BaseModel)
```

Suggested ontology type from augmentation.

Fields are validated using Pydantic. See Field descriptions for details.

#### name

#### description

#### parent

#### confidence

#### examples

## AugmentRequest Objects

```python
class AugmentRequest(BaseModel)
```

Request model for ontology augmentation endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### persona\_id

#### domain

#### existing\_types

#### target\_category

#### max\_suggestions

## AugmentResponse Objects

```python
class AugmentResponse(BaseModel)
```

Response model for ontology augmentation endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### id

#### persona\_id

#### target\_category

#### suggestions

#### reasoning

## BoundingBox Objects

```python
class BoundingBox(BaseModel)
```

Bounding box coordinates for object detection.

Fields are validated using Pydantic. See Field descriptions for details.

#### x

#### y

#### width

#### height

## Detection Objects

```python
class Detection(BaseModel)
```

Single object detection result.

Fields are validated using Pydantic. See Field descriptions for details.

#### label

#### bounding\_box

#### confidence

#### track\_id

## DetectionRequest Objects

```python
class DetectionRequest(BaseModel)
```

Request model for object detection endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### video\_id

#### query

#### video\_path

#### frame\_numbers

#### confidence\_threshold

#### enable\_tracking

## FrameDetections Objects

```python
class FrameDetections(BaseModel)
```

Detections for a single video frame.

Fields are validated using Pydantic. See Field descriptions for details.

#### frame\_number

#### timestamp

#### detections

## DetectionResponse Objects

```python
class DetectionResponse(BaseModel)
```

Response model for object detection endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### id

#### video\_id

#### query

#### frames

#### total\_detections

#### processing\_time

## TrackingMaskData Objects

```python
class TrackingMaskData(BaseModel)
```

RLE-encoded segmentation mask for tracked object.

Fields are validated using Pydantic. See Field descriptions for details.

#### object\_id

#### mask\_rle

#### confidence

#### is\_occluded

## TrackingFrameResult Objects

```python
class TrackingFrameResult(BaseModel)
```

Tracking results for a single video frame.

Fields are validated using Pydantic. See Field descriptions for details.

#### frame\_number

#### timestamp

#### masks

#### processing\_time

## TrackingRequest Objects

```python
class TrackingRequest(BaseModel)
```

Request model for object tracking endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### video\_id

#### initial\_masks

#### object\_ids

#### frame\_numbers

## TrackingResponse Objects

```python
class TrackingResponse(BaseModel)
```

Response model for object tracking endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### id

#### video\_id

#### frames

#### video\_width

#### video\_height

#### total\_frames

#### processing\_time

#### fps

## ErrorResponse Objects

```python
class ErrorResponse(BaseModel)
```

Error response model for API errors.

Fields are validated using Pydantic. See Field descriptions for details.

#### error

#### message

#### details

## ClaimExtractionRequest Objects

```python
class ClaimExtractionRequest(BaseModel)
```

Request model for claim extraction endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### summary\_id

#### summary\_text

#### sentences

#### annotations

#### ontology\_types

#### ontology\_glosses

#### extraction\_strategy

#### max\_claims

#### min\_confidence

## ExtractedClaim Objects

```python
class ExtractedClaim(BaseModel)
```

Single extracted claim with metadata.

Fields are validated using Pydantic. See Field descriptions for details.

#### text

#### sentence\_index

#### char\_start

#### char\_end

#### subclaims

#### confidence

#### claim\_type

## ClaimExtractionResponse Objects

```python
class ClaimExtractionResponse(BaseModel)
```

Response model for claim extraction endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### summary\_id

#### claims

#### model\_used

#### processing\_time

## ClaimSource Objects

```python
class ClaimSource(BaseModel)
```

Source of claims for synthesis (single video or collection).

Fields are validated using Pydantic. See Field descriptions for details.

#### source\_id

#### source\_type

#### claims

#### metadata

## ClaimRelationship Objects

```python
class ClaimRelationship(BaseModel)
```

Relationship between claims across sources.

Fields are validated using Pydantic. See Field descriptions for details.

#### source\_claim\_id

#### target\_claim\_id

#### relation\_type

#### confidence

#### notes

## SummarySynthesisRequest Objects

```python
class SummarySynthesisRequest(BaseModel)
```

Request model for summary synthesis endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### summary\_id

#### claim\_sources

#### claim\_relations

#### ontology\_context

#### persona\_context

#### synthesis\_strategy

#### max\_length

#### include\_conflicts

#### include\_citations

## SummarySynthesisResponse Objects

```python
class SummarySynthesisResponse(BaseModel)
```

Response model for summary synthesis endpoint.

Fields are validated using Pydantic. See Field descriptions for details.

#### summary\_id

#### summary\_gloss

#### model\_used

#### processing\_time

#### claims\_used

#### synthesis\_metadata

