pragma circom 2.1.9;

include "../node_modules/circomlib/circuits/comparators.circom";

template SimpleCompositeCheck() {
    signal input n;
    signal input factor1;
    signal input factor2;
    signal output isComposite;

    signal product;

    // Compute the product of the two factors
    product <== factor1 * factor2;

    // Check if the product equals n
    component isProductEqual = IsEqual();
    isProductEqual.in[0] <== product;
    isProductEqual.in[1] <== n;

    // Check if factor1 > 1
    component isFactor1GreaterThan1 = GreaterThan(64);
    isFactor1GreaterThan1.in[0] <== factor1;
    isFactor1GreaterThan1.in[1] <== 1;

    // Check if factor2 > 1
    component isFactor2GreaterThan1 = GreaterThan(64);
    isFactor2GreaterThan1.in[0] <== factor2;
    isFactor2GreaterThan1.in[1] <== 1;

    // Check if factor1 < n
    component isFactor1LessThanN = LessThan(64);
    isFactor1LessThanN.in[0] <== factor1;
    isFactor1LessThanN.in[1] <== n;

    // Check if factor2 < n
    component isFactor2LessThanN = LessThan(64);
    isFactor2LessThanN.in[0] <== factor2;
    isFactor2LessThanN.in[1] <== n;

    // Combine the conditions in a quadratic manner
    signal condition1;
    signal condition2;
    signal condition3;

    condition1 <== isProductEqual.out * isFactor1GreaterThan1.out;
    condition2 <== isFactor2GreaterThan1.out * isFactor1LessThanN.out;
    condition3 <== condition1 * condition2;

    isComposite <== condition3 * isFactor2LessThanN.out;
}

component main {public [n]} = SimpleCompositeCheck();