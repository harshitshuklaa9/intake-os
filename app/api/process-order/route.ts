import OpenAI from 'openai'
import { NextRequest } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const EXTRACTION_SYSTEM_PROMPT = `You are a clinical data extraction agent. Extract all required DME order fields from the input and return ONLY a valid JSON object with no markdown, no backticks, no explanation. Required fields: patientName, dateOfBirth, insuranceType, insuranceId, physicianName, npiNumber, diagnosisCode, product, quantity, deliveryAddress, status, riskFlags. For insuranceType, value must be exactly 'Medicare', 'Medicaid', or 'Unknown'. For status, value must be exactly one of: 'ACCEPTED', 'ACTION_REQUIRED', 'INELIGIBLE_INSURANCE', or 'REVIEW_REQUIRED'. Use null for any missing scalar fields. Populate riskFlags as an array of short strings describing each clinical concern found. Empty array if none.

Status rules — apply in this exact priority order:
1. Set ACTION_REQUIRED if any required field is missing or null.
2. Set INELIGIBLE_INSURANCE if insuranceType is 'Unknown' (not Medicare or Medicaid).
3. Set REVIEW_REQUIRED when all required fields are present AND any of the following apply: the diagnosis code does not clinically support the ordered product (e.g. hypertension or cardiac diagnoses alone do not qualify for power wheelchairs under Medicare LCD L33702); there is a physician state vs patient delivery state mismatch; product-specific documentation requirements are not met (CPAP/BiPAP requires sleep study evidence, power wheelchairs require mobility exam documentation, oxygen requires blood gas or oximetry data). REVIEW_REQUIRED takes priority over ACCEPTED whenever any clinical flag exists.
4. Set ACCEPTED only if all fields are present, insuranceType is Medicare or Medicaid, and there are zero clinical flags.`

const CLINICAL_SYSTEM_PROMPT = `You are an intelligent DME order intake agent for a fulfillment operation serving Medicare and Medicaid patients only. You receive partner orders in natural language from case managers, SNF staff, and home care agencies.

You have deep knowledge of Medicare and Medicaid DME documentation requirements:
CPAP and BiPAP — requires polysomnography or home sleep test result, AHI score of 5 or greater, face-to-face clinical evaluation within 30 days. Flag if not mentioned.
Power wheelchairs — Medicare LCD L33702 requires face-to-face mobility examination, detailed written order, documentation that patient cannot use manual wheelchair. Hypertension, diabetes without complications, cardiac conditions alone do not qualify. Flag physician state vs patient delivery state mismatch.
Manual wheelchairs — diagnosis must document mobility limitation.
Oxygen concentrators — requires arterial blood gas or oximetry showing saturation at or below 88%.
Hospital beds — requires documentation of condition requiring positioning a regular bed cannot provide.
Glucose monitors — requires diabetes diagnosis.

If ORDER ACCEPTED: confirm by patient name and product, state 2 to 3 business day processing timeline, explain what happens next. Warm and professional.
If ACTION REQUIRED: thank partner by agency name if mentioned, list only missing fields, explain in one sentence why each matters for Medicare or Medicaid authorization, ask to resubmit.
If REVIEW REQUIRED: confirm fields are complete but explain clinical flags clearly, state exactly what additional documentation is needed and which Medicare or Medicaid rule applies.
If INELIGIBLE INSURANCE: explain this service covers Medicare and Medicaid only, suggest partner confirm patient coverage. Do not list missing fields.

Sound like a sharp operations team member. Never robotic.`

export async function POST(req: NextRequest) {
  const { order } = await req.json()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // First call — extraction, no streaming
        const extraction = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: order }
          ]
        })

        const rawJson = extraction.choices[0].message.content?.trim() ?? '{}'
        const singleLine = JSON.stringify(JSON.parse(rawJson))
        controller.enqueue(new TextEncoder().encode(`DATA:${singleLine}\n`))

        // Second call — streaming response
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          stream: true,
          messages: [
            { role: 'system', content: CLINICAL_SYSTEM_PROMPT },
            { role: 'user', content: `Order data:\n${singleLine}\n\nOriginal order text:\n${order}` }
          ]
        })

        for await (const chunk of response) {
          const token = chunk.choices[0]?.delta?.content
          if (token) {
            controller.enqueue(new TextEncoder().encode(token))
          }
        }

        controller.close()
      } catch (err) {
        console.error('API error:', err)
        controller.error(err)
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  })
}
