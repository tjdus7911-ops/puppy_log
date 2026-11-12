package com.mungroad.domain

import com.mungroad.data.local.PetEntity
import com.mungroad.data.local.PetSize
import org.junit.Assert.assertEquals
import org.junit.Test

class RestCareTest {
    private fun pet(name: String = "사슴", age: Int? = 3, size: PetSize = PetSize.SMALL) =
        PetEntity("p-$name", name, null, null, age, null, size, "", 90, 0)

    @Test fun adultGetsGuideline120() {
        val (m, b) = RestCare.petInterval(pet())
        assertEquals(120, m); assertEquals(RestBasis.GUIDELINE, b)
    }
    @Test fun vetIntervalWins() {
        val (m, b) = RestCare.petInterval(pet().copy(vetRestIntervalMinutes = 45, guardianInterval = true, restIntervalMinutes = 100))
        assertEquals(45, m); assertEquals(RestBasis.VET, b)
    }
    @Test fun guardianBeforeGuideline() {
        assertEquals(100 to RestBasis.GUARDIAN, RestCare.petInterval(pet().copy(guardianInterval = true, restIntervalMinutes = 100)))
    }
    @Test fun kidneyIs60AndSeniorBySize() {
        assertEquals(60, RestCare.petInterval(pet().copy(healthCondition = HealthCondition.KIDNEY_DIABETES.name)).first)
        assertEquals(90, RestCare.petInterval(pet(age = 8, size = PetSize.LARGE)).first)
    }
    @Test fun unknownAgeUsesAppDefault() {
        assertEquals(90 to RestBasis.APP_DEFAULT, RestCare.petInterval(pet(age = null)))
    }
    @Test fun multiplePetsPickShortest() {
        val pol = RestCare.resolve(listOf(pet("사슴"), pet("코코", age = 0)))
        assertEquals(60, pol.intervalMinutes)
        assertEquals("p-코코", pol.petId)
    }
    @Test fun korean() {
        assertEquals("사슴이", Korean.callName("사슴"))
        assertEquals("코코", Korean.callName("코코"))
        assertEquals("곧 사슴이가 쉬어갈 시간이에요.", RestCare.soonVoice("사슴"))
    }
}
