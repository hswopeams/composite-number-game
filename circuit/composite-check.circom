pragma circom 2.1.9;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/gates.circom";

template CompositeCheck() {
    signal input n;
    signal output isComposite;

    // Ensure n is a 64-bit number. Limiting it to 64 bits for simplicity
    component nBits = Num2Bits(64);
    nBits.in <== n;

    component lt[64];
    component gt[64];
    component divCheck[64];
    component and1[64];
    component and2[64];
    
    signal factors[64];
    signal isFactorSignal[64];


    // Check factors from 2 to 64 (we start from 2 and go up to 33). Limiting the loops for simplicity and efiiciency. In practice, we would check factors up to sqrt(n)
    for (var i = 0; i < 64; i++) {
        factors[i] <== i + 2;  // Factors from 2 to 63
        
        // Check if factors[i] < n
        lt[i] = LessThan(64);
        lt[i].in[0] <== factors[i];
        lt[i].in[1] <== n;

        // Check if factors[i] > 1 (always true in this case, but we keep it for consistency)
        gt[i] = GreaterThan(64);
        gt[i].in[0] <== factors[i];
        gt[i].in[1] <== 1;

        // Check if factors[i] divides n
        divCheck[i] = DivisionCheck();
        divCheck[i].n <== n;
        divCheck[i].factor <== factors[i];

        // Use AND gates to combine conditions
        and1[i] = AND();
        and1[i].a <== lt[i].out;
        and1[i].b <== gt[i].out;

        and2[i] = AND();
        and2[i].a <== and1[i].out;
        and2[i].b <== divCheck[i].out;

        // factors[i] is a valid factor if all conditions are true
        isFactorSignal[i] <== and2[i].out;
    }

    // The number is composite if any isFactorSignal is 1
    var isCompositeTemp = 0;
    for (var i = 0; i < 32; i++) {
        isCompositeTemp = isCompositeTemp + isFactorSignal[i];
    }

    component gtZero = GreaterThan(64);
    gtZero.in[0] <== isCompositeTemp;
    gtZero.in[1] <== 0;
    isComposite <== gtZero.out;
}

// Custom template to check if 'factor' divides 'n' without remainder
template DivisionCheck() {
    signal input n;
    signal input factor;
    signal output out;

    signal quotient;
    signal remainder;

    // Check if factor is zero
    component isZero = IsZero();
    isZero.in <== factor;
    signal factorNotZero <== 1 - isZero.out;

    // Compute quotient and remainder
    quotient <-- n \ factor;
    remainder <-- n % factor;

    // Ensure n = factor * quotient + remainder when factor is not zero
    n === factor * quotient + remainder;

    // The division is valid (remainder is 0) only if factor is not zero
    component remainderIsZero = IsZero();
    remainderIsZero.in <== remainder;

    // Output is 1 if factor is not zero and remainder is zero
    out <== factorNotZero * remainderIsZero.out;
}


component main = CompositeCheck();