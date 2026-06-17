import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function NutritionClient() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/client/nutrition/plan', { replace: true })
  }, [navigate])
  return null
}
